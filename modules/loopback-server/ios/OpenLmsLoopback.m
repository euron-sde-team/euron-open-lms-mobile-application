// Exposes the Swift loopback module to React Native (see OpenLmsLoopback.swift).
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(OpenLmsLoopback, NSObject)

RCT_EXTERN_METHOD(start:(NSString *)rootDir resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stop:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setKey:(NSString *)itemId base64Key:(NSString *)base64Key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
