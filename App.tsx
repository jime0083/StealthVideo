import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  AppState,
  Clipboard,
  Image,
  ImageBackground,
  ImageSourcePropType,
  Linking,
  LogBox,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoadingAnimation from './components/LoadingAnimation';

// 開発モードでの不要なログバナーを非表示
LogBox.ignoreLogs([
  'Failed to load recording files',
  'Non-serializable values were found in the navigation state',
]);

const BACK_TAP_STORAGE_KEY = '3tapvideo:hasAcceptedBackTap';

type RecordingFile = {
  name: string;
  path: string;
  size: number;
  date: string;
};

type RecorderModule = {
  requestPermission: () => Promise<boolean>;
  startRecording: () => Promise<string>;
  stopRecording: () => Promise<string>;
  isRecording: () => Promise<boolean>;
  getRecordingFiles: () => Promise<RecordingFile[]>;
};

type SettingSlide = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  copyableText?: string;
  image?: ImageSourcePropType;
};

const recorderModule: RecorderModule | undefined =
  NativeModules.RecorderManager;

const App = (): React.JSX.Element => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [recordingFiles, setRecordingFiles] = useState<RecordingFile[]>([]);
  const [showFilesModal, setShowFilesModal] = useState(false);

  const loadRecordingFiles = useCallback(async () => {
    if (!recorderModule) {
      return;
    }
    try {
      const files = await recorderModule.getRecordingFiles();
      setRecordingFiles(files || []);
    } catch {
      // エラーは静かに処理（ファイルがない場合など）
      setRecordingFiles([]);
    }
  }, []);

  const syncRecordingState = useCallback(() => {
    if (!recorderModule) {
      setIsRecording(false);
      return;
    }
    recorderModule
      .isRecording()
      .then(setIsRecording)
      .catch(() => {
        setIsRecording(false);
      });
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        const value = await AsyncStorage.getItem(BACK_TAP_STORAGE_KEY);
        setShowOnboarding(value !== 'accepted');
        syncRecordingState();
        await loadRecordingFiles();
      } finally {
        // 最低1.5秒はローディングを表示（アニメーションを見せるため）
        setTimeout(() => {
          setIsLoading(false);
        }, 1500);
      }
    };
    initialize();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        syncRecordingState();
        loadRecordingFiles();
      }
    });
    return () => sub.remove();
  }, [syncRecordingState, loadRecordingFiles]);

  const ensurePermission = useCallback(async () => {
    if (!recorderModule || permissionChecked) {
      return;
    }
    try {
      const granted = await recorderModule.requestPermission();
      if (!granted) {
        Alert.alert(
          'カメラ/マイク権限が必要です',
          '設定アプリでカメラ/マイク権限を許可してからもう一度お試しください。',
        );
      } else {
        setPermissionChecked(true);
      }
    } catch (error) {
      Alert.alert('権限の確認に失敗しました', String(error));
    }
  }, [permissionChecked]);

  const handleOnboardingChoice = useCallback(
    async (accepted: boolean) => {
      setShowOnboarding(false);
      if (!accepted) {
        return;
      }
      await AsyncStorage.setItem(BACK_TAP_STORAGE_KEY, 'accepted');
      setGuideExpanded(true);
      ensurePermission();
    },
    [ensurePermission],
  );

  const openShortcuts = useCallback(async () => {
    const shortcutsURL = 'shortcuts://';
    const supported = await Linking.canOpenURL(shortcutsURL);
    if (supported) {
      Linking.openURL(shortcutsURL);
    } else {
      Alert.alert(
        'ショートカットアプリを開けません',
        'App Storeからショートカットアプリをインストールしてください。',
      );
    }
  }, []);

  const openBackTapSettings = useCallback(async () => {
    // Appleの非公開URLスキーム。失敗時は設定アプリトップへフォールバック。
    const backTapURL = 'App-prefs:Accessibility';
    const settingsURL = 'App-Prefs:';
    const canOpenSpecific = await Linking.canOpenURL(backTapURL);
    if (canOpenSpecific) {
      Linking.openURL(backTapURL);
      return;
    }
    const canOpenSettings = await Linking.canOpenURL(settingsURL);
    if (canOpenSettings) {
      Linking.openURL(settingsURL);
    } else {
      Alert.alert(
        '設定アプリを開けません',
        '手動で設定アプリを開いてください。',
      );
    }
  }, []);

  const openRecorderTestGuide = useCallback(() => {
    ensurePermission();
    Alert.alert(
      '録画テストの流れ',
      [
        '1. アプリ内のステータスカードで「録画中」と表示されるか確認。',
        '2. 背面トリプルタップでショートカットを起動し録画開始。',
        '3. 再度アプリに戻り「録画停止」ボタンで保存できるか確認。',
      ].join('\n'),
    );
  }, [ensurePermission]);

  const stopRecording = useCallback(async () => {
    if (!recorderModule) {
      Alert.alert('iOS専用機能', '録画機能はiOSデバイスでのみ利用できます。');
      return;
    }
    try {
      const fileName = await recorderModule.stopRecording();
      setIsRecording(false);
      await loadRecordingFiles();
      if (fileName !== 'idle') {
        Alert.alert(
          '録画を保存しました',
          `ファイル名: ${fileName}\n\n「録画ファイル一覧」ボタンで確認できます。`,
        );
      }
    } catch (error) {
      Alert.alert('録画停止に失敗しました', String(error));
    }
  }, [loadRecordingFiles]);

  const instructions = useMemo(
    () => [
      '設定アプリ > アクセシビリティ > タッチ > 背面タップ を開きます。',
      '「トリプルタップ」に「ショートカット」を割り当てます。',
      'ショートカットで「URLを開く」を追加し、URLに 3tapvideo://start を入力します。',
      '停止用に 3tapvideo://stop を割り当てたショートカットを作ると便利です。',
      '録画停止はこのアプリの「録画停止」ボタンで行います。',
    ],
    [],
  );

  const settingSlides = useMemo<SettingSlide[]>(
    () => [
      {
        id: 'download',
        title: '①ショートカットアプリの設定',
        subtitle: 'ショートカットアプリの準備',
        description:
          '※既にインストール済みの場合は②へ\n' +
          '1. App Storeを開く\n' +
          '2.「ショートカット」と検索\n' +
          '3. Apple公式アプリをダウンロード（無料）',
        actionLabel: 'App Storeを開く',
        onAction: openShortcuts,
        image: require('./assets/instructions/how to1.png'),
      },
      {
        id: 'shortcut',
        title: '②ショートカットの作成',
        subtitle: '録画開始用のショートカットを作る',
        description:
          '1. ショートカットアプリを開く\n' +
          '2. 右上「＋」→「アクションを追加」\n' +
          '3.「Web」を選択 →「URLを開く」を選択\n' +
          '4. 下のURLをコピーして貼り付け\n' +
          '5. 名前を「録画開始」にして完了',
        actionLabel: 'ショートカットを開く',
        onAction: openShortcuts,
        copyableText: '3tapvideo://start',
        image: require('./assets/instructions/how to2.png'),
      },
      {
        id: 'accessibility',
        title: '③背面タップを設定',
        subtitle: '②で作成したショートカットを割り当て',
        description:
          '1. 設定 > アクセシビリティ > タッチ\n' +
          '2.「背面タップ」→「トリプルタップ」\n' +
          '3. 下にスクロールして「ショートカット」欄へ\n' +
          '4.「録画開始」を選択（チェックが付けばOK）',
        actionLabel: '設定を開く',
        onAction: openBackTapSettings,
        image: require('./assets/instructions/how to3.png'),
      },
      {
        id: 'test',
        title: '④動作テスト',
        subtitle: '正しく録画できるか確認',
        description:
          '1. このアプリを閉じてホーム画面へ\n' +
          '2. iPhoneの背面を3回タップ\n' +
          '3. アプリを開いて「録画中」と表示されれば成功\n' +
          '4.「録画停止」ボタンで保存\n\n' +
          '※録画中は画面右上に緑（カメラ）/オレンジ（マイク）の点が表示されます',
        actionLabel: 'テスト手順',
        onAction: openRecorderTestGuide,
        image: require('./assets/instructions/how to4.png'),
      },
      {
        id: 'files',
        title: '⑤録画ファイルの確認',
        subtitle: '保存した動画を再生する',
        description:
          '1.「ファイル」アプリを開く\n' +
          '2.「このiPhone内」→「3タップビデオ」\n' +
          '3. 3tapvideo-日時.mov が録画ファイル\n' +
          '4. タップして再生できます\n\n' +
          '※ファイル名の日時は録画開始時刻です',
        actionLabel: 'ファイルを開く',
        onAction: () => {
          Linking.openURL('shareddocuments://');
        },
        image: require('./assets/instructions/how to5.png'),
      },
    ],
    [openBackTapSettings, openRecorderTestGuide, openShortcuts],
  );

  // ローディング画面
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <LoadingAnimation color="#D1597B" dotSize={18} showText={true} />
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('./assets/background.png')}
      style={styles.background}
      imageStyle={styles.backgroundImage}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>現在の状態</Text>
            <Text
              style={[
                styles.statusValue,
                isRecording && styles.statusValueActive,
              ]}>
              {isRecording ? '録画中' : '待機中'}
            </Text>
            <Pressable
              style={[
                styles.stopButton,
                !isRecording && styles.stopButtonDisabled,
              ]}
              onPress={stopRecording}
              disabled={!isRecording}>
              <Text style={styles.stopButtonText}>
                {isRecording ? '録画停止' : '録画は待機中'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.settingSection}>
            <Text style={styles.settingTitle}>3タップビデオの使い方</Text>
            <View style={styles.settingList}>
              {settingSlides.map(slide => (
                <View key={slide.id} style={styles.settingItem}>
                  {slide.image && (
                    <Image
                      source={slide.image}
                      style={styles.settingItemImage}
                      resizeMode="contain"
                    />
                  )}
                  <View style={styles.settingItemHeader}>
                    <Text style={styles.settingItemTitle}>{slide.title}</Text>
                    <Text style={styles.settingItemSubtitle}>{slide.subtitle}</Text>
                  </View>
                  <Text style={styles.settingItemDescription}>
                    {slide.description}
                  </Text>
                  {slide.copyableText && (
                    <Pressable
                      style={styles.copyButton}
                      onPress={() => {
                        Clipboard.setString(slide.copyableText || '');
                        Alert.alert('コピーしました', slide.copyableText);
                      }}>
                      <Text style={styles.copyButtonText}>
                        {slide.copyableText}
                      </Text>
                      <Text style={styles.copyButtonLabel}>タップでコピー</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showOnboarding} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              背面トリプルタップを有効にしますか？
            </Text>
            <Text style={styles.modalDescription}>
              3タップビデオを使用するには、背面3回タップで録画を開始できるようショートカットを設定する必要があります。
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalButtonSecondary,
                  styles.modalButtonSpacing,
                ]}
                onPress={() => handleOnboardingChoice(false)}>
                <Text style={styles.modalButtonSecondaryText}>No</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => handleOnboardingChoice(true)}>
                <Text style={styles.modalButtonPrimaryText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFilesModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.filesModalContent}>
            <Text style={styles.modalTitle}>録画ファイル一覧</Text>
            {recordingFiles.length === 0 ? (
              <Text style={styles.filesEmptyText}>
                録画ファイルがありません。{'\n'}
                背面タップで録画を開始してみてください。
              </Text>
            ) : (
              <ScrollView style={styles.filesList}>
                {recordingFiles.map((file, index) => (
                  <View key={file.name} style={styles.fileItem}>
                    <Text style={styles.fileName}>{file.name}</Text>
                    <Text style={styles.fileInfo}>
                      サイズ: {Math.round(file.size / 1024)} KB
                    </Text>
                    <Text style={styles.fileInfo}>
                      日時: {new Date(file.date).toLocaleString('ja-JP')}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable
              style={[styles.modalButton, styles.modalButtonPrimary]}
              onPress={() => setShowFilesModal(false)}>
              <Text style={styles.modalButtonPrimaryText}>閉じる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020406',
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    flex: 1,
    backgroundColor: '#020406',
  },
  backgroundImage: {
    resizeMode: 'cover',
    opacity: 0.65,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  settingTitle: {
    color: '#cfd3dd',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    fontFamily: 'HiraginoMincho-W6',
  },
  settingSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  settingList: {
    gap: 12,
  },
  settingItem: {
    backgroundColor: 'rgba(8,12,20,0.85)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  settingItemImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  settingItemHeader: {
    marginBottom: 8,
    gap: 4,
  },
  settingItemTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'HiraginoMincho-W6',
  },
  settingItemSubtitle: {
    color: '#9fb3d4',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'HiraginoMincho-W3',
  },
  settingItemDescription: {
    color: '#cfd3dd',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
    fontFamily: 'HiraginoMincho-W3',
  },
  settingItemButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  settingItemButtonText: {
    color: '#6fb1ff',
    fontWeight: '600',
    fontFamily: 'HiraginoMincho-W6',
  },
  copyButton: {
    backgroundColor: 'rgba(111,177,255,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    padding: 12,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#6fb1ff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  copyButtonLabel: {
    color: '#9fb3d4',
    fontSize: 11,
    marginTop: 4,
    fontFamily: 'HiraginoMincho-W3',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'HiraginoMincho-W6',
  },
  subtitle: {
    color: '#cfd3dd',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 16,
    fontFamily: 'HiraginoMincho-W3',
  },
  statusCard: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  statusLabel: {
    color: '#a3acc3',
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 4,
    fontFamily: 'HiraginoMincho-W3',
  },
  statusValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
    fontFamily: 'HiraginoMincho-W6',
  },
  statusValueActive: {
    color: '#f85c70',
  },
  stopButton: {
    backgroundColor: '#f85c70',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stopButtonDisabled: {
    opacity: 0.5,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'HiraginoMincho-W6',
  },
  filesButton: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  filesButtonText: {
    color: '#6fb1ff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'HiraginoMincho-W6',
  },
  guideToggle: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  guideToggleText: {
    color: '#6fb1ff',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'HiraginoMincho-W6',
  },
  guideCard: {
    backgroundColor: 'rgba(6,10,18,0.72)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  guideText: {
    color: '#dde3f7',
    lineHeight: 22,
    marginBottom: 8,
    fontFamily: 'HiraginoMincho-W3',
  },
  guideActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  guideActionButton: {
    flex: 1,
  },
  guideActionButtonSpacing: {
    marginRight: 12,
  },
  linkButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 140,
  },
  linkButtonText: {
    color: '#6fb1ff',
    fontWeight: '600',
    fontFamily: 'HiraginoMincho-W6',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#0f1424',
    borderRadius: 20,
    padding: 24,
  },
  slideModalContent: {
    backgroundColor: '#0f1424',
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
  },
  slideModalImage: {
    height: 180,
  },
  slideModalImageInner: {
    opacity: 0.5,
  },
  slideModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  slideModalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'HiraginoMincho-W6',
  },
  slideModalSubtitle: {
    color: '#cfd3dd',
    marginTop: 6,
    fontFamily: 'HiraginoMincho-W3',
  },
  slideModalDescription: {
    color: '#cfd3dd',
    padding: 20,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'HiraginoMincho-W3',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'HiraginoMincho-W6',
  },
  modalDescription: {
    color: '#cfd3dd',
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: 'HiraginoMincho-W3',
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#6fb1ff',
  },
  modalButtonPrimaryText: {
    color: '#0f1424',
    fontWeight: '700',
    fontFamily: 'HiraginoMincho-W6',
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: '#6fb1ff',
  },
  modalButtonSpacing: {
    marginRight: 12,
  },
  modalButtonSecondaryText: {
    color: '#6fb1ff',
    fontWeight: '700',
    fontFamily: 'HiraginoMincho-W6',
  },
  filesModalContent: {
    backgroundColor: '#0f1424',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '80%',
  },
  filesEmptyText: {
    color: '#9fb3d4',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginVertical: 24,
    fontFamily: 'HiraginoMincho-W3',
  },
  filesList: {
    marginVertical: 16,
    maxHeight: 300,
  },
  fileItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  fileName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    fontFamily: 'HiraginoMincho-W6',
  },
  fileInfo: {
    color: '#9fb3d4',
    fontSize: 12,
    fontFamily: 'HiraginoMincho-W3',
  },
});

export default App;
