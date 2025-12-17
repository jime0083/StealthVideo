import Foundation
import AVFoundation
import React

@objc(RecorderManager)
@objcMembers
public class RecorderManager: NSObject, AVCaptureFileOutputRecordingDelegate {
  private static let fileDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd_HHmmss"
    formatter.locale = Locale(identifier: "ja_JP")
    return formatter
  }()

  // 全インスタンスで共有する（URLスキーム起動とRN呼び出しで状態を共有するため）
  private static var captureSession: AVCaptureSession?
  private static var movieOutput: AVCaptureMovieFileOutput?
  private static var currentRecordingURL: URL?

  public static let shared = RecorderManager()

  @objc public static func sharedInstance() -> RecorderManager {
    return RecorderManager.shared
  }

  @objc public static func requiresMainQueueSetup() -> Bool {
    // AVFoundation周りはメインスレッド前提の箇所があるため
    return true
  }

  // MARK: - React Native bridge

  @objc public func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let group = DispatchGroup()
    var videoGranted = false
    var audioGranted = false

    group.enter()
    AVCaptureDevice.requestAccess(for: .video) { granted in
      videoGranted = granted
      group.leave()
    }

    group.enter()
    AVCaptureDevice.requestAccess(for: .audio) { granted in
      audioGranted = granted
      group.leave()
    }

    group.notify(queue: .main) {
      resolve(videoGranted && audioGranted)
    }
  }

  @objc public func startRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      do {
        let fileName = try RecorderManager.beginRecording(delegate: RecorderManager.shared)
        resolve(fileName)
      } catch {
        reject("recording_error", error.localizedDescription, error)
      }
    }
  }

  @objc public func stopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      let result = RecorderManager.stopRecordingInternal()
      resolve(result)
    }
  }

  @objc public func isRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(RecorderManager.movieOutput?.isRecording ?? false)
  }

  @objc public func getRecordingFiles(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let fileManager = FileManager.default
    guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
      resolve([])
      return
    }

    NSLog("[StealthVideo] Documents directory: %@", documentsURL.path)

    do {
      let files = try fileManager.contentsOfDirectory(
        at: documentsURL,
        includingPropertiesForKeys: [.creationDateKey, .fileSizeKey],
        options: []
      )

      let videoFiles = files
        .filter { $0.pathExtension.lowercased() == "mov" || $0.pathExtension.lowercased() == "mp4" }
        .compactMap { url -> [String: Any]? in
          let attributes = try? fileManager.attributesOfItem(atPath: url.path)
          let size = attributes?[.size] as? Int64 ?? 0
          let date = attributes?[.creationDate] as? Date ?? Date()
          return [
            "name": url.lastPathComponent,
            "path": url.path,
            "size": size,
            "date": ISO8601DateFormatter().string(from: date)
          ]
        }
        .sorted { ($0["date"] as? String ?? "") > ($1["date"] as? String ?? "") }

      NSLog("[StealthVideo] Found %d video files", videoFiles.count)
      resolve(videoFiles)
    } catch {
      NSLog("[StealthVideo] Error listing files: %@", error.localizedDescription)
      resolve([])
    }
  }

  // MARK: - URL scheme shortcut entry

  @objc public func handleShortcut(withAction action: String?) {
    guard let action else {
      NSLog("[StealthVideo] handleShortcut: action is nil")
      return
    }

    NSLog("[StealthVideo] handleShortcut: action = %@", action)

    switch action.lowercased() {
    case "start":
      // カメラ/マイク権限を確認してから録画開始
      let group = DispatchGroup()
      var videoGranted = false
      var audioGranted = false

      group.enter()
      AVCaptureDevice.requestAccess(for: .video) { granted in
        videoGranted = granted
        group.leave()
      }

      group.enter()
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        audioGranted = granted
        group.leave()
      }

      group.notify(queue: .main) {
        NSLog("[StealthVideo] Permission video=%@ audio=%@", videoGranted ? "YES" : "NO", audioGranted ? "YES" : "NO")
        guard videoGranted && audioGranted else {
          return
        }
        do {
          let fileName = try RecorderManager.beginRecording(delegate: RecorderManager.shared)
          NSLog("[StealthVideo] Recording started: %@", fileName)
        } catch {
          NSLog("[StealthVideo] Recording failed: %@", error.localizedDescription)
        }
      }

    case "stop":
      let result = RecorderManager.stopRecordingInternal()
      NSLog("[StealthVideo] Recording stopped: %@", result)

    default:
      NSLog("[StealthVideo] Unknown action: %@", action)
      break
    }
  }

  // MARK: - Internal recording logic

  private static func stopRecordingInternal() -> String {
    guard let output = movieOutput, output.isRecording else {
      return "idle"
    }

    let fileName = currentRecordingURL?.lastPathComponent ?? "stopping"
    output.stopRecording()
    return fileName
  }

  private static func beginRecording(delegate: AVCaptureFileOutputRecordingDelegate) throws -> String {
    if let output = movieOutput, output.isRecording, let url = currentRecordingURL {
      return url.lastPathComponent
    }

    try configureSessionIfNeeded()

    guard let session = captureSession, let output = movieOutput else {
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "録画セッションの初期化に失敗しました"])
    }

    if !session.isRunning {
      session.startRunning()
    }

    let url = try makeMovieURL()
    currentRecordingURL = url

    // 既に存在する同名ファイルがあれば削除
    if FileManager.default.fileExists(atPath: url.path) {
      try? FileManager.default.removeItem(at: url)
    }

    output.startRecording(to: url, recordingDelegate: delegate)
    return url.lastPathComponent
  }

  private static func configureSessionIfNeeded() throws {
    if captureSession != nil && movieOutput != nil {
      return
    }

    let session = AVCaptureSession()
    session.beginConfiguration()
    session.sessionPreset = .high

    // Video input (back camera preferred)
    let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
      ?? AVCaptureDevice.default(for: .video)

    guard let videoDevice else {
      session.commitConfiguration()
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "カメラデバイスを取得できません"])
    }

    let videoInput = try AVCaptureDeviceInput(device: videoDevice)
    if session.canAddInput(videoInput) {
      session.addInput(videoInput)
    } else {
      session.commitConfiguration()
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "カメラ入力を追加できません"])
    }

    // Audio input (microphone)
    if let audioDevice = AVCaptureDevice.default(for: .audio) {
      let audioInput = try AVCaptureDeviceInput(device: audioDevice)
      if session.canAddInput(audioInput) {
        session.addInput(audioInput)
      }
    }

    // Movie output
    let output = AVCaptureMovieFileOutput()
    if session.canAddOutput(output) {
      session.addOutput(output)
    } else {
      session.commitConfiguration()
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "録画出力を追加できません"])
    }

    session.commitConfiguration()

    captureSession = session
    movieOutput = output
  }

  private static func makeMovieURL() throws -> URL {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    guard let directory = documents.first else {
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "Documentsディレクトリを取得できません"])
    }

    let timestamp = fileDateFormatter.string(from: Date())
    let filename = "3tapvideo-\(timestamp).mov"
    return directory.appendingPathComponent(filename)
  }

  // MARK: - AVCaptureFileOutputRecordingDelegate

  public func fileOutput(
    _ output: AVCaptureFileOutput,
    didFinishRecordingTo outputFileURL: URL,
    from connections: [AVCaptureConnection],
    error: Error?
  ) {
    if let error {
      NSLog("[StealthVideo] didFinishRecording error: %@", error.localizedDescription)
    } else {
      NSLog("[StealthVideo] didFinishRecording: %@", outputFileURL.lastPathComponent)
    }
  }
}
