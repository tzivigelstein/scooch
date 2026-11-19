_Draft. Not legal advice. A legal professional has to review it before it
is published or relied on._

_This is a translation of the [Spanish version](../privacidad.md), which is
the reference until a lawyer reviews this one._

# Privacy policy

In effect from November 19, 2026.

## In short

- Your files never leave your browser. We don’t upload them, see them or
  keep them.
- There are no accounts and no sign-up.
- What Scooch saves stays on your device, and you can delete it whenever
  you want.
- As with any website, the provider that hosts Scooch (Vercel) receives
  technical data from each visit.

## Who is responsible

Tzivi Santiago Gelstein offers Scooch. When this policy says _we_, it means
him. You can write to us at
[gelsteintzivisantiago@gmail.com](mailto:gelsteintzivisantiago@gmail.com).

## Your files

The images and PDFs you add are opened and processed inside your browser.
Scooch doesn’t send them to any server: not to us, not to anyone else.

The PDF you download or print is also created in your browser. When you
print, the browser sends it to the printer you choose, like any other
document.

The same goes for images you paste into Scooch: they’re treated as a file you
add. When you copy or cut items, Scooch puts on your system’s clipboard only
a line of text (for example, “2 Scooch items”) and the time of the copy, not
the images.

## What is stored on your device

So that you don’t lose your work and to remember your preferences, Scooch
stores data in your browser’s storage: IndexedDB and localStorage.
That data stays only in that browser, on that device. It isn’t sent to us
or to anyone else. Scooch doesn’t store cookies.

### Your projects

In the `scooch` IndexedDB database:

- **Projects.** For each project: its name; when it was created, when it was
  saved and when you last opened it; how many sheets and items it has; a
  thumbnail of the first sheet, for the Projects list, and the document. The
  document has the sheets, the paper, the margin, the spacing, auto-rotate,
  whether items may overlap, the cut lines and, for each item, its position,
  size, rotation and crop, with the name and dimensions of the file it comes
  from.
- **Files.** The original files you added (images and PDFs), a preview of
  each item and, when needed, a converted version of the image to include in
  the PDF. Each file is stored only once, even if several items or several
  projects use it: to recognize it, your browser computes a fingerprint of
  its content (a _hash_), which doesn’t leave your device either.
- **Undo history.** The last steps of each project (up to 50), so that Undo
  and Redo keep working if you reload the page or open the project again. It
  includes the items those steps can bring back, with their files, even if
  you’ve already removed them from the sheet.
- **Cut items.** The items you cut with Cut and haven’t pasted yet, with their
  files, so they aren’t lost if you reload the page. They’re deleted when you
  paste them, or when you copy or cut other items.

A file is deleted from the browser when no project, undo history or cut item
uses it anymore.

### Preferences and working data

In localStorage, with names that start with `scooch:`:

- **Units:** mm, cm or in, as you chose in Preferences.
- **Theme:** automatic, light or dark.
- **Language:** automatic (your browser’s) or the one you chose in
  Preferences.
- **Single-key shortcuts:** whether they’re turned on.
- **View:** the zoom (Show whole sheet, Show sheet width or the percentage
  you chose, but never how far you scrolled) and what you chose in Align to
  and Distribute by.
- **Grid and snap:** whether the grid shows, its size and whether snapping to
  it is on.
- **Properties sections:** the ones you closed, and whether you left More
  options open in the cut lines.
- **Printing notices:** whether the tip before printing or downloading and
  the summary afterwards show, or whether you chose Don’t show again.
- **Custom paper:** the last paper size you typed.
- **Recent actions:** the last 5 actions you chose in Search actions.
- **Usage tips:** whether they show, the ones you chose not to see again and,
  to know when to offer one, how many times you did some actions with a
  button or a menu instead of their shortcut and which ones you’ve already
  done the faster way. They’re only counts and names of actions, not what’s
  in your projects.
- **Sheets saved:** the total of sheets you’ve saved on this device, which
  the summary after printing shows; a round figure you reached, if the
  summary hasn’t shown it to you yet, and which comparison the next summary
  uses. So as not to count the same PDF twice, also a short key of each of the
  last 50 PDFs and of the last one you printed, which is added to the total
  later. The key is computed from the PDF’s content, but it can’t be used to
  rebuild it or to see its images.
- **Invitation to support:** whether you chose not to see it again.
- **Last project:** which project was open last, to open it when you come
  back.
- **Temporary copy:** if you close the tab before a change finishes saving, a
  copy of the open document (without the files), which is used when you come
  back and deleted once the project is saved.
- **Earlier version mark:** an internal mark that says the data of an earlier
  version of the app has already been moved to the current names.

If the browser had data saved by an earlier version of the app (under the
name `pliego`), Scooch moves it once to the names above and then deletes the
old ones. Some preferences that earlier versions saved may still be in the
browser, such as whether items could overlap (today that is saved with each
project): Scooch no longer changes them, it only reads them to open projects
from that time as they were.

When it saves a project with items, Scooch asks the browser to keep this data
and not delete it on its own to free up space. The browser decides whether
to agree. In Projects, Scooch also asks it how much space the data takes and
how much is left, to show you.

If you open Scooch in several tabs, the tabs tell each other which project
each one has open, so they don’t overwrite each other’s changes. Those
messages go through the browser’s internal mechanisms (a channel between
tabs and a lock for each project) and don’t leave your device.

## How to delete this data

- **One project:** in Projects, use Delete. The project is deleted from the
  browser with its undo history and its temporary copy, and its files too,
  except those another project or a cut item still uses. It can’t be undone.
- **Everything:** in your browser’s settings, clear the data this site
  stored. The option is usually in the privacy or site data section,
  depending on the browser. That deletes the projects, their files and
  histories, the cut items and the preferences.

In some private windows, the browser doesn’t allow projects to be saved.
Scooch tells you, and what you do is lost when you close the tab.

Since your files and your projects are only on your device, we can’t see
them, hand them over to you or delete them for you.

## What we don’t do

- We don’t ask for an account, a name, an email or any other personal data to
  use Scooch.
- Scooch doesn’t use cookies, advertising, trackers or analytics
  tools.
- Scooch doesn’t load anything from other servers: the code, the fonts and
  the libraries are served from the same site.
- We don’t sell personal data.

## Other services

### Hosting: Vercel

The site is hosted on Vercel. As with any web server, when your browser
requests Scooch’s pages and files, Vercel receives technical data from each
request. For example: your IP address, the browser and the system you use,
the page you requested, the date and the time. Vercel handles that data
according to its own
[privacy policy](https://vercel.com/legal/privacy-notice).

Your images, your PDFs and your projects are never part of those requests.

### Support: Patreon

If the option to support Scooch appears and you open the Support on Patreon
link, you go to Patreon’s site, in another tab. Scooch doesn’t send Patreon
any data about you or your files. If you don’t open the link, Patreon
receives nothing. What you do on Patreon is governed by its
[privacy policy](https://privacy.patreon.com/).

### Analytics

> **PENDING: fill in only if analytics are added.** Today Scooch doesn’t use
> analytics tools. If one is added, this section has to say which one it is,
> what data it collects, what for, whether it uses cookies or other
> identifiers, who processes them and where, how long they are kept and how
> to turn it off. [What we don’t do](#what-we-dont-do) and the effective date
> have to be updated too, before turning it on.

## Minors

Scooch doesn’t ask anyone for personal data, minors included. If you’re a
minor, use Scooch with the support of a responsible adult, especially if
you’re going to print photos of other people.

## Changes to this policy

We may update this policy, for example when the app changes. The effective
date above shows which version is current. If a change affects what is
stored or what is sent, we’ll explain it on this page.

## Contact

For privacy questions, write to
[gelsteintzivisantiago@gmail.com](mailto:gelsteintzivisantiago@gmail.com).
