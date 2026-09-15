#import "atolla_app/native/ios/AtollaDownloadGuards.h"

NSString *const AtollaDownloadUnauthorizedResult = @"atolla:unauthorized";

@implementation AtollaDownloadGuards

+ (NSString *)failureResultForStatus:(NSInteger)status {
    return status == 401 ? AtollaDownloadUnauthorizedResult : @"";
}

@end
