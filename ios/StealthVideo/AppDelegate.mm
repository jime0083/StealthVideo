#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTBridgeModule.h>
#import "StealthVideo-Swift.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"StealthVideo";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self getBundleURL];
}

- (NSURL *)getBundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (BOOL)application:(UIApplication *)app
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  if ([[url.scheme lowercaseString] isEqualToString:@"stealthvideo"]) {
    NSString *action = url.host ?: url.lastPathComponent;
    if (action.length == 0 && url.pathComponents.count > 1) {
      action = url.pathComponents[1];
    }
    [[RecorderManager sharedInstance] handleShortcutWithAction:action];
    return YES;
  }
  return [super application:app openURL:url options:options];
}

@end
