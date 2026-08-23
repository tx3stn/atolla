#import <XCTest/XCTest.h>
#import "atolla_app/native/ios/AtollaImageFallback.h"

@interface AtollaImageFallbackTest : XCTestCase
@end

@implementation AtollaImageFallbackTest

// --- AtollaThumbFallbackCategory ---

- (void)testAlbumArtFallsBackToItsThumb {
    XCTAssertEqualObjects(@"album_art_thumb", AtollaThumbFallbackCategory(@"album_art"));
}

- (void)testArtistImageFallsBackToItsThumb {
    XCTAssertEqualObjects(@"artist_image_thumb", AtollaThumbFallbackCategory(@"artist_image"));
}

- (void)testPlaylistImageFallsBackToItsThumb {
    XCTAssertEqualObjects(@"playlist_image_thumb", AtollaThumbFallbackCategory(@"playlist_image"));
}

- (void)testThumbCategoriesHaveNoFurtherFallback {
    XCTAssertNil(AtollaThumbFallbackCategory(@"album_art_thumb"));
    XCTAssertNil(AtollaThumbFallbackCategory(@"artist_image_thumb"));
    XCTAssertNil(AtollaThumbFallbackCategory(@"playlist_image_thumb"));
}

- (void)testLogoGenreAndBlurredCategoriesHaveNoFallback {
    XCTAssertNil(AtollaThumbFallbackCategory(@"artist_logo"));
    XCTAssertNil(AtollaThumbFallbackCategory(@"genre_art"));
    XCTAssertNil(AtollaThumbFallbackCategory(@"album_art_blurred"));
}

- (void)testUnknownCategoryHasNoFallback {
    XCTAssertNil(AtollaThumbFallbackCategory(@"not_a_category"));
    XCTAssertNil(AtollaThumbFallbackCategory(@""));
}

// --- AtollaBlurSourceKeys ---

- (void)testBlurSourcePrefersTheThumbThenTheFullOriginal {
    NSArray<NSString *> *expected = @[@"album_art_thumb:album-1:abc", @"album_art:album-1:abc"];
    XCTAssertEqualObjects(expected, AtollaBlurSourceKeys(@"album-1:abc"));
}

@end
