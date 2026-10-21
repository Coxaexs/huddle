# Code signing

The Hoffle desktop apps are built from this repository by GitHub Actions
(`.github/workflows/desktop.yml`), straight from the tagged source, and
published on the GitHub release and on [hoffle.online](https://hoffle.online/#download).

## Windows

Free code signing provided by [SignPath.io](https://about.signpath.io),
certificate by [SignPath Foundation](https://signpath.org).

Windows shows **SignPath Foundation** as the publisher. Only builds made by
the workflow above, from a tag in this repository, are sent for signing, and
each one is approved by hand before it is signed.

## macOS

Signed with Hoffle's Apple Developer ID and notarized by Apple, once that
account is set up. Until then the Mac apps are ad-hoc signed, and macOS asks
you to allow them in System Settings → Privacy & Security the first time.

## Who does what

- Committers and reviewers: [Abdullah Türk](https://github.com/Coxaexs)
- Approvers (who approve each signing request): [Abdullah Türk](https://github.com/Coxaexs)

Everyone with these roles uses two-factor authentication on GitHub and SignPath.

## Privacy

The desktop apps connect to the Hoffle server you sign in to
(chat.hoffle.online unless you point them at your own), and to nothing else
unless you ask them to, for example by opening a link. They contain no
analytics or trackers. What the server keeps is in the
[privacy policy](https://hoffle.online/privacy).

## Checking a download

Each installer on hoffle.online is copied from the GitHub release, and the
release lists a SHA-256 for every file. On Windows, right-click the installer →
Properties → Digital Signatures to see the signature.
