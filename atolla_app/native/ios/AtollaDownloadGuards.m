#import "atolla_app/native/ios/AtollaDownloadGuards.h"

NSString *const AtollaDownloadUnauthorizedResult = @"atolla:unauthorized";

@implementation AtollaDownloadGuards

+ (NSString *)failureResultForStatus:(NSInteger)status carriedAuth:(BOOL)carriedAuth {
    return status == 401 && carriedAuth ? AtollaDownloadUnauthorizedResult : @"";
}

@end
