<!-- markdownlint-disable MD033 -->
<p align="center">
 <img src="./atolla/res/logo.svg" alt="logo" width="200" />
 <h1 align="center">atolla</h1>
</p>

<p align="center">
  <em>beautiful Jellyfin music player for android and ios with an offline first playback experience</em>
</p>

## TOC

* [Features](#features)
* [Screenshots](#screenshots)
  * [player](#player)
  * [home tab](#home-tab)
  * [artist view](#artist-view)
  * [library & album view](#library-&-album-view)
  * [seach & genre list](#search-&-genre-list)
* [Installing](#installing)
  * [Android](#android)
  * [iOS](#ios)
* [Why?](#why)
* [How does `atolla` compare?](#how-does-atolla-compare)
* [Feature Requests](#feature-requests)
* [Bug Reports](#bug-reports)
* [Contributing](#contributing)

## Features

* Seamless offline experience, everything that works online also works offline (including search, scrobbling, playlist creation and editing)
* Gap-less playback
* Dynamic colour palettes generated from album artwork
* Local waveform generation for fancy progress bars
* Image focussed UI (featuring artist logos)
* Playlist creation & editing

## Screenshots

### player

<p align="center">
 <img src="https://github.com/user-attachments/assets/cad3ea3e-97d8-4261-88ad-b8bb5a101702" alt="player" width="49%" />
 <img src="https://github.com/user-attachments/assets/71a88b15-31f9-401e-b1f0-d482d6ce0674" alt="player-play-queue" width="49%" />
</p>

* color palettes generated from album art.
* track waveform progress bar
* artist logo front and center

### home tab

<p align="center">
 <img src="https://github.com/user-attachments/assets/2f8b7a01-ef09-46f9-b8b5-4fdc92743164" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/e59b6072-0e94-45e7-8b84-125b293b7d9a" alt="artist-2" width="49%" />
</p>

* albums released on this day
* recently added
* recently played
* various mixes

### artist view

<p align="center">
 <img src="https://github.com/user-attachments/assets/e918674b-76ce-4061-9a01-aed180ed6783" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/42d9f96e-a0f5-4cc3-8a21-d5f5ac5a0aef" alt="artist-2" width="49%" />
</p>

* artist most played tracks
* genre pills that link to the genre view (including offline)
* artist bios in modal

### library

<p align="center">
 <img src="https://github.com/user-attachments/assets/426790e9-b969-43f1-8ab1-87d6147e1862" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/5fe69b87-4236-413b-bce6-a55079105a73" alt="artist-2" width="49%" />
</p>

### album

<p align="center">
 <img src="https://github.com/user-attachments/assets/75b4ebd8-2bdd-48d3-8253-b6909dc4d5dc" alt="album-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/d5eec9da-1864-4f6b-bdaf-101662fef309" alt="album-2" width="49%" />
</p>

* audio file quality badges on albums
* genre pills that link to the genre view (including offline)
* album bios in modal

### search & settings

<p align="center">
 <img src="https://github.com/user-attachments/assets/5f909219-bb0e-4299-b617-74eb8b77add0" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/32ccc4f9-ad68-4214-8abe-1dfa994f163e" alt="artist-2" width="49%" />
</p>

* search that works online and offline
* genre playlists that work online and offline
* genre tags on artists and albums online and offline

## Installing

You can download the relevant `.apk` and `.ipa` files from the releases section.
More release options will be coming in the future.

### Android

Install via [Obtainium](https://github.com/ImranR98/Obtainium)

### iOS

Install via your sideloading method of choice.

> [!IMPORTANT]
> **The iOS app is in beta.**
>
> It has been tested a lot in an emulator, but I don't have an iPhone, so can't test
> it on device.
> As such I can't guarantee it will work as well as the Android version which I have
> been using daily for months.
>
> If you run into issues please raise them. If you can create a PR to fix the
> issues and test it out on your own device, even better.

## Why?

I switched from Plex to Jellyfin several years ago, but could never find a
Jellyfin music player as good as Plexamp.
So I built my own.
This is the music app I want to use.

However, there are a few things I'd like to stress that this app isn't:

### It's not a comprehensive Jellyfin music management solution

The focus is on the listening experience not managing the data on your server.
There will always be some functionality that's available in Jellyfin but not in
the app as it's not a good fit, and that's fine.

### It's not a feature compatible alternative to Plexamp

I'm not trying to build "Plexamp for Jellyfin", I'm trying to build a great
music player for Jellyfin, so there will be some things that Plexamp does that
atolla doesn't, and some things atolla does that Plexamp doesn't.

### It's not a fully customisable 'make it your own' app

The design is intentionally opinionated, it won't try to give you all of the
customisation options you *might* want, as that makes it a lot harder
to maintain. Suggestions for improvements or things that could be tweakable are
always welcomed, but they **might not** be actioned.

## How does `atolla` compare?

There are other Jellyfin music apps out there, you might already be using one of them,
so I thought it was worth giving a comparison to the alternatives.

It's always good to have more options. Thank you to the people putting in the
hardwork and spending their time to create and maintain these apps 🖤

I mean no disrespect to anyone with my criticisms, I'm simply saying why they
weren't the right choice for me personally. If they work for you, or you prefer
them to atolla great!

### [Finamp](https://github.com/UnicornsOnLSD/finamp)

Finamp has a more comprehensive feature set than atolla, it can do a lot.
Whilst they are aware the UI needs work and are working on a rework, it's very
slow progress and I think it's a long way off being a polished app with a good
user experience.

* It's **very** slow to load for my music library. Painfully so at times.
* The UI is ugly (to me) and dated.
* It's trying to be everything to everyone, with a huge amount of options and customisation.

atolla loads the same library instantly. It has been designed from the
ground up for efficiency, making heavy use of caching, paginated API requests and
background workers to ensure everything loads as quickly as possible so you can get
straight to listening.

### [Jellify](https://github.com/Jellify-Music/App)

I haven't used Jellify personally so can't speak on it's performance, but these are
the things that made me dismiss it in my search for the right Jellyfin music player.

* The UI is ugly (to me), it's inconsistent, with lots of wasted space and tiny artwork.
* Looking at the issues it's missing a lot of features I'd consider important for a music app (which atolla has implemented).

## What atolla does differently

### Seamless offline mode

Offline mode works just likes online mode so the app is always consistent to use.
It's not relegated to it's own non searchable tab like Plexamp where most of the
app becomes unusable without data.
Offline mode is a first class citizen.

Actions that require the connection to work (like playlist creation or editing)
get queued until you next have a connection. You can create a playlist fully offline
whenever you want, and have it auto sync the next time you connect to your server.

When you download a playlist, the playlist tracks will show up in the library
artists, albums and genres views for an experience truely on par with online mode.

You can search your downloaded data. You'll get results for only the things you
have downloaded.

Library mixes like "shuffle library" and "random album" all work offline.

### Artist logos

This is such a tiny thing but it's honestly one of my favourite things Jellyfin
supports that Plex doesn't.

Everyone wants to see the unreadable logos of their most listened to black metal
bands prominently displayed in their music apps right?

## Feature Requests

**Got something you'd like to see?**

Create a new 'feature request' issue.

**Like an idea someone else has requested?**

Add a reaction to the request (thumbs up/plus 1/whatever). Don't add a comment to it just saying +1, nobody likes those.

## Bug Reports

Something broken or not working as expected?

Please fill in a bug report and complete all of the details requested to ensure
it can be properly investigated.

## Contributing

See [CONTRIBUTING.md](/.github/CONTRIBUTING.md) for details on building and developing.

## Migrating from Plexamp?

If you are migrating from Plexamp and want to sync all of your playlists you might
like [plex2pl](https://github.com/tx3stn/plex2pl), which can create jellyfin
native versions of all of your playlists.
