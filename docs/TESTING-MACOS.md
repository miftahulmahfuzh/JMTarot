# Testing JMTarot on a MacBook

A complete, assume-nothing walkthrough for running JMTarot on macOS — on a real
iPhone, and in the iOS Simulator.

Written for Jodith. Nothing here costs money and nothing needs an Apple
Developer account.

---

## Which track do you want?

There are two, and **Track A is dramatically faster.** Read this before
downloading anything.

| | Track A — real iPhone | Track B — iOS Simulator |
|---|---|---|
| Time | ~10 minutes | 1–3 hours, mostly downloading |
| Disk | ~500 MB | ~40 GB |
| Needs Xcode | **No** | Yes |
| Real haptics | Yes | No — the Simulator has none |
| Real gesture feel | Yes | No — a trackpad is not a thumb |
| Multiple screen sizes | Only yours | Any iPhone Apple ships |

**Do Track A first.** It answers the questions we actually have right now, and it
answers them better than the Simulator does, because the thing we most need
judged is how the card fan *feels* under a thumb. Track B is worth it later for
checking layout on small and large iPhones.

You can do both. Track A's setup is a prerequisite for neither.

---

## Track A — run on your iPhone in ~10 minutes

### A1. Install the Xcode Command Line Tools

This is a ~1 GB developer toolkit, **not** the 40 GB Xcode app. It gives you
`git`. Open **Terminal** (⌘-Space, type "Terminal", Enter) and run:

```sh
xcode-select --install
```

A dialog appears — click **Install** and agree. If it says
`command line tools are already installed`, you are done with this step.

Verify:

```sh
git --version
```

You want any version ≥ 2.30. Anything modern is fine.

### A2. Install Homebrew

Homebrew is the macOS package manager. Skip if `brew --version` already works.

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It will ask for your Mac password — that is expected, it needs to create
`/opt/homebrew`.

**On Apple Silicon (M1/M2/M3/M4) it then prints two commands to run.** They look
like this. You must actually run them, or `brew` will not be found in new
terminal windows:

```sh
echo >> ~/.zprofile
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Verify:

```sh
brew --version
```

### A3. Install Node

**This project will refuse to build on an old Node.** React Native 0.86 requires
`^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0`, and the failure looks like a
random build error rather than a clear version complaint. So check it.

```sh
brew install node
```

Verify — and read the number carefully:

```sh
node -v
```

Anything from Homebrew today satisfies the requirement. If it prints something
like `v18.x` or `v20.11.x`, that is **too old** and you will hit confusing
errors; see [Troubleshooting](#node-version-is-too-old).

Also install Watchman. It is optional, but without it Metro's file watching on
macOS is slower and occasionally misses changes:

```sh
brew install watchman
```

### A4. Clone the repository

```sh
cd ~
git clone https://github.com/miftahulmahfuzh/JMTarot.git
cd JMTarot
```

The clone is ~66 MB because the source card artwork lives in the repo, so give
it a moment.

### A5. Install the project's dependencies

```sh
npm install
```

This takes 1–3 minutes and prints a few `deprecated` warnings. Those are normal
and come from transitive dependencies — ignore them.

### A6. Install Expo Go on your iPhone

On the **iPhone**, open the App Store and install **Expo Go** (publisher: 650
Industries). It is free.

You do not need to create an account to run our app.

### A7. Start the dev server

Back in Terminal, in the `JMTarot` folder:

```sh
npx expo start
```

After a few seconds you get a QR code and a line like
`Metro waiting on exp://192.168.1.x:8081`.

**macOS will likely pop up a firewall prompt** asking whether `node` may accept
incoming connections. Click **Allow** — the iPhone needs to reach Metro.

### A8. Open it on the iPhone

Your **iPhone must be on the same Wi-Fi network as the MacBook.**

Open the **Camera** app, point it at the QR code in Terminal, and tap the
notification. Expo Go launches and starts downloading the JS bundle.

First load takes 30–90 seconds — it is compiling the whole app. Subsequent
reloads are near-instant.

You should land on a dark starfield screen reading **JMTAROT / Selamat datang**.

> If the QR scan does nothing, open Expo Go directly and use **Enter URL
> manually**, typing the `exp://…` address Terminal printed.

### A9. Editing and reloading

Leave `npx expo start` running. Any file you save reloads on the phone
automatically. Useful keys in that Terminal window:

| Key | Does |
|---|---|
| `r` | Force reload |
| `j` | Open the JS debugger |
| `?` | List all commands |
| `Ctrl-C` | Stop the server |

---

## Track B — the iOS Simulator

Only needed to check layout across iPhone sizes. **Start the Xcode download
before you do anything else** — it is enormous and slow.

### B1. Install Xcode

Open the **Mac App Store**, search **Xcode**, install. It is free.

Budget **~7–10 GB of download and ~40 GB of disk space**, and anywhere from 20
minutes to several hours depending on your connection. You can continue with
Track A while it downloads.

### B2. First launch and licence

Open Xcode once from Applications. It installs additional components and asks
you to accept a licence — accept it.

Then in Terminal:

```sh
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### B3. Install an iOS Simulator runtime

**Recent Xcode versions ship with no iOS runtime.** If you skip this, there will
be no simulators to launch and the error message will not explain why.

In Xcode: **Settings** (⌘-,) → **Platforms** → find **iOS** → **Get**. Another
several GB.

Verify you have at least one device:

```sh
xcrun simctl list devices available
```

You want to see entries like `iPhone 16 Pro (…) (Shutdown)`. An empty list means
the runtime did not install.

### B4. Run JMTarot in the Simulator

From the `JMTarot` folder:

```sh
npm run ios
```

Or run `npx expo start` and press **`i`**.

The Simulator boots, Expo Go is installed into it automatically, and the app
launches. First boot is slow; later ones are quick.

To try a different device: in the Simulator app, **File → Open Simulator →**
pick another iPhone, then press `i` again.

**Simulator caveats:** no haptics at all, and mouse-dragging a card feels nothing
like dragging with a thumb. Do not judge the fan's feel here — judge its layout.

---

## What to actually look at

This is the useful part. The app has never been rendered on a real screen — every
layout number in it was derived on paper. **Please be blunt.**

### The card fan — the highest priority by far

Reader → any reader → **Tiga Kartu**.

The whole app's quality rests on this screen, and it is the piece most likely to
be wrong. Specifically:

1. **Are all 22 cards visible?** The outermost two should be clipped by the screen
   edges — that is intentional and reads as a real fanned hand. But if you cannot
   see or reach the outer cards at all, the arc is too wide.
2. **Can you tell the cards apart?** Each reveals only ~18 pt of itself. Is that
   enough to feel like a deck, or does it read as a smear?
3. **Can you reliably pick the card you meant?** Those 18 pt strips are narrow tap
   targets. This is my main worry.
4. **Does dragging a card upward feel good?** It should lift with your finger and
   then fly to a slot when you let go. Tapping should also work.
5. **Do cards land cleanly in the three slots** at the top, without overshooting
   or jittering?
6. **Does the flip look like a card turning over,** or like an image swapping?
7. **Do the bottom edge cards tuck behind the footer bar?** Intended.
8. **Does it stay smooth** while dragging, or does it stutter?

### Everything else

- **Reader picker** — do the three portraits load? Is the text readable over
  them? Do the gold specialty chips wrap sensibly rather than overflowing?
- **Greeting** says "Selamat datang" and never your name. Correct for now —
  onboarding is not built, so there is no name to greet.
- **Service picker** — does the portrait fade smoothly into the dark background,
  or is there a visible hard edge? Is the bio comfortable to read?
- **Kartu Harian** — pull it once. Go back. Enter it again. You should see the
  **same card** at large size with "Kembali besok untuk kartu baru", not a new
  fan. This is the daily gate.
- **Ya atau Tidak** — one card, then a verdict line reading `Ya —` / `Tidak —` /
  `Belum jelas —`.
- **Reversed cards** — roughly 3 in 10 draws come out upside down. Do they look
  deliberate, or broken?
- **Fonts** — headings should be Cinzel (spaced capitals), body should be
  Cormorant Garamond (a light serif, often italic). If you are seeing plain
  system sans-serif, the fonts failed to load and that is a bug.
- **Notch and home indicator** — is anything colliding with either?

### Known and expected

- The reading text on the draw screen is a **placeholder**. It just names the
  cards. The real result screen does not exist yet.
- Card **artwork is visually inconsistent** — cards 0–10 have warm cream frames,
  12–21 are cool navy, and 11 and 17 differ again. A three-card spread will mix
  them. Known, on the list, needs regenerating.
- Card **names are in English** because the artwork has titles printed into the
  images. Everything else is Indonesian. Intentional.

---

## Please do not run this

```sh
npm run assets     # <- not this one
```

It regenerates all 22 card images. They are committed to the repo, so if you and
Miftah both run it you get a 22-file binary conflict that Git cannot merge — one
of you would have to discard the other's version wholesale.

Only one person should regenerate assets, and only when the source art actually
changes. `npm run cards` is harmless by comparison but the same logic applies.

---

## Troubleshooting

### Node version is too old

```sh
node -v
```

If below `v20.19.4`, install a current one:

```sh
brew install node
brew link --overwrite node
```

Then **open a new Terminal window** and check `node -v` again. If it still
reports the old version, something else on your PATH is winning — run
`which -a node` and tell us what it prints.

### `command not found: brew`

You skipped the two `shellenv` lines in step A2. Run them, or open a new Terminal.

### `command not found: npx`

Node did not install, or its PATH is not set. Redo A3 in a new Terminal.

### The iPhone cannot connect / stuck "Downloading"

1. Confirm both devices are on the **same Wi-Fi**. Phone on cellular is the most
   common cause.
2. Some networks — especially cafés, hotels, and university Wi-Fi — block
   device-to-device traffic. Route around it:

   ```sh
   npx expo start --tunnel
   ```

   Slower, but works on any network.
3. Check the macOS firewall did not silently block `node`: **System Settings →
   Network → Firewall → Options**, and allow it.

### `Unable to boot device` / no simulators

The iOS runtime is missing. Do step B3, then:

```sh
xcrun simctl list devices available
```

### `xcrun: error: unable to find utility "simctl"`

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

### Metro behaves strangely after pulling changes

Clear the cache:

```sh
npx expo start -c
```

### `Port 8081 is running another process`

```sh
npx expo start --port 8082
```

### The app is a white or blank screen

Look at the Terminal running `npx expo start` — the real error is almost always
printed there. Copy that text when reporting it; "it was blank" is not
diagnosable on its own.

### `EMFILE: too many open files`

```sh
brew install watchman
```

---

## What you do *not* need

- **The $99 Apple Developer Program.** Not for the Simulator, not for Expo Go.
  It is only needed to put builds on TestFlight or the App Store.
- **EAS Build.** That is for producing real `.ipa` builds later.
- **Certificates or provisioning profiles.** Expo Go sidesteps all of it.
- **A custom dev build.** Every native module JMTarot uses is already in Expo Go,
  which is why this is so much simpler than React Native usually is.

---

## Reporting back

The most useful thing you can send is **a screen recording of the draw screen**
(iPhone: Settings → Control Centre → add Screen Recording, then swipe down and
hit record). Watching the fan move answers more questions than any description.

Beyond that, answers to these:

1. Can you reliably pick the card you intended? — the single most important question
2. Does the fan look right, or too cramped / too wide?
3. Does anything stutter?
4. Does any text collide with the notch or the home indicator?
5. Are the fonts serif (correct) or plain sans-serif (broken)?

Reading the [design document](plans/2026-07-25-tarot-mvp-design.md) first is
worth it — it records every decision and why. `CLAUDE.md` in the repo root is
worth pointing your own Claude Code at; it documents several fixes that look
like mistakes and will get "corrected" back into bugs otherwise.
