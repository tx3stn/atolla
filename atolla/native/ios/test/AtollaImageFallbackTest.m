#import <XCTest/XCTest.h>
#import "atolla/native/ios/AtollaImageFallback.h"

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

// --- AtollaImageCacheIdentity ---

- (void)testDerivesEntityIdAndTagFromAJellyfinImageUrl {
    XCTAssertEqualObjects(
        @"album-1:abc",
        AtollaImageCacheIdentity(@"https://media.example.com/Items/album-1/Images/Primary?tag=abc"));
}

- (void)testDerivesArtistIdFromALogoUrl {
    XCTAssertEqualObjects(
        @"artist-9:def",
        AtollaImageCacheIdentity(@"https://media.example.com/Items/artist-9/Images/Logo?tag=def"));
}

- (void)testOmitsTheTagSegmentWhenThereIsNoTag {
    XCTAssertEqualObjects(
        @"genre-3",
        AtollaImageCacheIdentity(@"https://media.example.com/Items/genre-3/Images/Primary"));
}

- (void)testIgnoresThumbnailSizingParamsSoFullAndThumbShareTheIdentity {
    XCTAssertEqualObjects(
        @"album-1:abc",
        AtollaImageCacheIdentity(
            @"https://media.example.com/Items/album-1/Images/Primary?tag=abc&maxWidth=384&quality=85"));
}

- (void)testFallsBackToTheApiKeyStrippedUrlForANonJellyfinUrl {
    XCTAssertEqualObjects(
        @"https://cdn.example.com/cover.jpg?x=1",
        AtollaImageCacheIdentity(@"https://cdn.example.com/cover.jpg?api_key=SECRET&x=1"));
}

- (void)testFallsBackToTheUrlUnchangedWhenItHasNoQuery {
    XCTAssertEqualObjects(
        @"https://cdn.example.com/cover.jpg",
        AtollaImageCacheIdentity(@"https://cdn.example.com/cover.jpg"));
}

@end
