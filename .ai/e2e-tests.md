# end to end tests

End to tests use webdriver.io.

## page object model

All interactions should use the page object model.
Locators should be defined once in the page object as a prviate constant.
Components should use an accessibilityId so they can be interacted with.

## test actions

Follow the Arrange, Act, Assert pattern.
Test actions should be kept small and simple so the behvaiour is easy to understand.
They need to work cross platform, on ios and android.
