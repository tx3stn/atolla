#import <atollaTypes/atollaTypes.h>
#import <valdi_core/SCValdiModuleFactoryRegistry.h>
#import <Foundation/Foundation.h>
#import <Network/Network.h>

// Real device reachability via Network.framework. NWPathMonitor pushes path updates (used to
// notify JS so parked downloads can resume) and also holds the current path (read by the sync
// getter). Transport is reported so callers can later distinguish wifi vs cellular.
@interface AtollaNetworkReachabilityNativeModuleImpl : NSObject <atollaNetworkReachabilityNativeModule>
@end

@implementation AtollaNetworkReachabilityNativeModuleImpl {
    nw_path_monitor_t _monitor;
    NSLock *_lock;
    BOOL _reachable;
    NSString *_transport;
    void (^_observer)(void);
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _lock = [[NSLock alloc] init];
        // assume online until the first path update lands, matching the JS assume-online default
        _reachable = YES;
        _transport = @"none";
        _monitor = nw_path_monitor_create();
        __weak AtollaNetworkReachabilityNativeModuleImpl *weakSelf = self;
        nw_path_monitor_set_update_handler(_monitor, ^(nw_path_t _Nonnull path) {
            [weakSelf handlePathUpdate:path];
        });
        nw_path_monitor_set_queue(_monitor,
                                  dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0));
        nw_path_monitor_start(_monitor);
    }
    return self;
}

- (void)handlePathUpdate:(nw_path_t)path {
    BOOL reachable = nw_path_get_status(path) == nw_path_status_satisfied;
    NSString *transport = @"none";
    if (reachable) {
        if (nw_path_uses_interface_type(path, nw_interface_type_wifi)) {
            transport = @"wifi";
        } else if (nw_path_uses_interface_type(path, nw_interface_type_cellular)) {
            transport = @"cellular";
        } else if (nw_path_uses_interface_type(path, nw_interface_type_wired)) {
            transport = @"wifi";
        }
    }

    void (^observer)(void) = nil;
    [_lock lock];
    _reachable = reachable;
    _transport = transport;
    observer = _observer;
    [_lock unlock];

    if (observer) {
        observer();
    }
}

- (NSString * _Nonnull)getAtollaNetworkStatus {
    [_lock lock];
    BOOL reachable = _reachable;
    NSString *transport = _transport;
    [_lock unlock];
    return [NSString stringWithFormat:@"{\"reachable\":%@,\"transport\":\"%@\"}",
                                      reachable ? @"true" : @"false",
                                      transport];
}

- (void)setAtollaNetworkStatusObserverWithOnChange:
    (atollaNetworkReachabilityNativeModuleSetAtollaNetworkStatusObserverOnChangeBlock _Nonnull)
        onChange {
    [_lock lock];
    _observer = [onChange copy];
    [_lock unlock];
}

- (void)clearAtollaNetworkStatusObserver {
    [_lock lock];
    _observer = nil;
    [_lock unlock];
}

@end

// MARK: - Module Factory

@interface AtollaNetworkReachabilityNativeModuleFactoryImpl : atollaNetworkReachabilityNativeModuleFactory
@end

@implementation AtollaNetworkReachabilityNativeModuleFactoryImpl

VALDI_REGISTER_MODULE()

- (id<atollaNetworkReachabilityNativeModule> _Nonnull)onLoadModule {
    return [[AtollaNetworkReachabilityNativeModuleImpl alloc] init];
}

@end
