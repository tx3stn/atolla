#import "atolla/native/ios/AtollaAuthRedirectGuard.h"

// a redirect keeps the auth headers only if it stays on the server's host without downgrading to
// http. off-host hops (a CDN, or a malicious redirect) and cleartext downgrades go out without the
// Jellyfin token so it can't leak
BOOL AtollaRedirectKeepsAuth(NSURL *_Nullable server, NSURL *_Nullable target) {
    if (server == nil || target == nil || server.scheme == nil || target.scheme == nil ||
        server.host == nil || target.host == nil) {
        return NO;
    }
    if ([server.host caseInsensitiveCompare:target.host] != NSOrderedSame) {
        return NO;
    }
    BOOL isDowngrade = [server.scheme caseInsensitiveCompare:@"https"] == NSOrderedSame &&
                       [target.scheme caseInsensitiveCompare:@"http"] == NSOrderedSame;
    return !isDowngrade;
}

@implementation AtollaAuthRedirectGuard

+ (NSURLSession *)sharedDefaultSession {
    static NSURLSession *session;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSOperationQueue *queue = [[NSOperationQueue alloc] init];
        session = [NSURLSession sessionWithConfiguration:NSURLSessionConfiguration.defaultSessionConfiguration
                                                delegate:[[AtollaAuthRedirectGuard alloc] init]
                                           delegateQueue:queue];
    });
    return session;
}

- (void)URLSession:(NSURLSession *)session
                      task:(NSURLSessionTask *)task
    willPerformHTTPRedirection:(NSHTTPURLResponse *)response
                    newRequest:(NSURLRequest *)request
             completionHandler:(void (^)(NSURLRequest *_Nullable))completionHandler {
    if (AtollaRedirectKeepsAuth(task.originalRequest.URL, request.URL)) {
        completionHandler(request);
        return;
    }
    NSMutableURLRequest *sanitized = [request mutableCopy];
    [sanitized setValue:nil forHTTPHeaderField:@"X-Emby-Token"];
    [sanitized setValue:nil forHTTPHeaderField:@"Authorization"];
    completionHandler(sanitized);
}

@end
