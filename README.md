<!-- markdownlint-disable MD033 -->
<p align="center">
 <img src="./atolla/res/logo.svg" alt="logo" width="200" />
 <h1 align="center">atolla</h1>
</p>

<p align="center">
  <em>beautiful Jellyfin music player for android and ios with an offline first playback experience</em>
</p>

## Features

* Gapless playback
* Seamless online/offline switching (including offline search & scrobbling)
* Image focussed UI (featuring artist logos)
* Dynamic colour palettes generated from album artwork
* Local waveform generation for fancy progress bars
* Playlist creation & editing

## Screenshots

### player

<p align="center">
 <img src="https://github.com/user-attachments/assets/dc0da699-e41f-4cd3-9213-238c3c8d5794" alt="player" width="49%" />
 <img src="https://github.com/user-attachments/assets/ad7f9f64-d32c-4f88-8962-15e3250e48f2" alt="player-play-queue" width="49%" />
</p>

* Color palettes generated from album art.
* Track waveform progress bar
* Artist logo front and center

### home tab

<p align="center">
 <img src="https://github.com/user-attachments/assets/83438302-2ebb-4cd1-89bf-b970910c585a" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/5af7c50f-7f1b-46d0-a15f-3510361caa9a" alt="artist-2" width="49%" />
</p>

* Albums release on this day
* Recently added
* Recently played
* Various mixes

### artist view

<p align="center">
 <img src="https://github.com/user-attachments/assets/83438302-2ebb-4cd1-89bf-b970910c585a" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/5af7c50f-7f1b-46d0-a15f-3510361caa9a" alt="artist-2" width="49%" />
</p>

### library & album view

<p align="center">
 <img src="https://github.com/user-attachments/assets/4579959b-97aa-4cd0-a7b3-e35c506cf2b4" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/5d7ef4be-5957-4f3b-a539-10a23d40b569" alt="artist-2" width="49%" />
</p>

* Floating player progress bar

### search & genre list

<p align="center">
 <img src="https://github.com/user-attachments/assets/a71c81e8-f112-41c2-9b69-d32e380ad394" alt="artist-1" width="49%" />
 <img src="https://github.com/user-attachments/assets/3e43e8b0-d152-4d14-ac06-f06af624bd4e" alt="artist-2" width="49%" />
</p>

* Search that works online and offline
* Genre playlists that work online and offline
* Genre pills on artists and albums online and offline

## Why?

I switched from Plex to Jellyfin several years ago, but could never find a
Jellyfin music player as good as Plexamp. Findroid is great, it's got a more
comprehensive feature set that atolla, and they're making good progress with
the UI rework, but it's just not what I want out of a music player.
So I built my own one. This is the music app I want to use.

However, there are a few things I'd like to stress that this app isn't:

**It's not a comprehensive Jellyfin music management solution**
The focus is on the listening experience not managing the data on your server.
There will also be some functionality that's available in Jellyfin but not in
the app as it's not a good fit, and that's fine.

**It's not a feature compatible alternative to Plexamp.**
I'm not trying to build "Plexamp for Jellyfin", I'm trying to build a great
music player for Jellyfin, so there will be some things that Plexamp does that
atolla doesn't, and some things atolla does that Plexamp doesn't.

**It's not a fully customisable 'make it your own' app.**
The design is intentionally opinionated, it won't try to give you all of the
customisation options you want to configure things, that makes it a lot harder
to maintain. Suggestions for improvements or things that could be editable are
always welcomed, but they might not be actioned.

## Installing

TBD

> [!WARNING] the iOS app is in beta
>
> It has been tested a lot in an emulator, but I don't have an iPhone, so can't test
> it on device.
> As such I can't gurantee it will work as well as the Android version which I have
> been using daily for weeks.
>
> If you run into issues please raise them. If you can create a PR to fix the
> issues and test it out on your own device, even better.

## Feature Requests

Got something you'd like to see?

Create an issue and label it as 'feature request'.

## Contributing

See CONTRIBUTING.md for details on building and developing.
