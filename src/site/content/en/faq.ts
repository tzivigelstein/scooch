// «Frequently asked questions»: about the tool itself (each guide has its own).

import { app, link, MAX_ITEMS, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { papersSentence, photoSizesSentence } from './chrome.ts';
import { PATHS } from './paths.ts';

export function faqPage(k: Kit): SitePage {
  const { ui, num } = k;
  return {
    id: 'faq',
    lang: 'en',
    path: PATHS.faq,
    title: `Frequently asked questions about ${app}`,
    description: `What ${app} is, what it costs, where your files stay, which papers and photo sizes it has, and how to print at actual size.`,
    h1: 'Frequently asked questions',
    crumb: 'Frequently asked questions',
    kind: 'faq',
    indexable: true,
    body: `<p class="lead">What’s most useful to know before using ${app}. For each use, like multiple pictures on one page or passport photos, there’s a guide with its own questions.</p>`,
    faq: [
      {
        q: `What is ${app}?`,
        a: `${app} is a free web tool that arranges images and PDF pages on sheets of paper at actual size and creates a PDF to download or print. It works in the browser, with nothing to install.`,
      },
      { q: 'How much does it cost?', a: `Nothing. ${app} is free, needs no account, and adds no watermarks or ads.` },
      {
        q: `Can I use ${app} for paid work or in my business?`,
        a: `Yes. You can use ${app} on this site for any purpose, commercial ones included: in a print shop, to print stickers you sell or your business’s own material. The PDFs and prints you make are yours: you can use and sell them without paying, crediting ${app} or asking for permission. What isn’t allowed is commercializing the tool itself: for example, selling it, charging for access to it or publishing a copy with ads. There’s more in the ${link(PATHS['legal-terms'], 'terms of use')}.`,
      },
      {
        q: 'Are my files uploaded to a server?',
        a: `No. Images and PDFs are opened and processed in your browser, and the PDF is created there too. There’s more in the ${link(PATHS['legal-privacy'], 'privacy policy')}.`,
      },
      {
        q: 'Where are my projects saved?',
        a: `In your browser, on that device. They save on their own as you work, and you can open or delete them in ${ui('projects.title')}. If you clear the site’s data in the browser, they’re lost: keep your original files.`,
      },
      {
        q: 'What files can I add?',
        a: 'Images your browser can open (JPG, PNG, WebP…) and PDFs. Each page of a PDF is an item.',
      },
      { q: 'What papers does it have?', a: `${papersSentence(k)}.` },
      { q: 'What photo sizes does it have?', a: `${photoSizesSentence(k)}. You can also type any width and height.` },
      {
        q: 'How do I print at actual size?',
        a: `Press ${ui('bar.print')} or ${ui('bar.download')} and, in the print dialog, choose “Actual size” or “100%”. There’s more in the guide to ${link(PATHS['actual-size'], 'printing an image at actual size')}.`,
      },
      { q: 'Does it work on a phone?', a: 'Yes, in your phone’s or tablet’s browser, with nothing to install.' },
      { q: 'How many items can I add?', a: `Up to ${num(MAX_ITEMS)} items per project, on as many sheets as it takes.` },
      {
        q: 'Does it work for passport and ID photos?',
        a: `Yes, to crop and print them at size. But each application sets its own requirements (size, background, framing) and ${app} doesn’t check them: always check with the office that asks for the photo. See the guide to ${link(PATHS['id-photos'], 'printing passport photos at home')}.`,
      },
      {
        q: 'Can I make stickers with it?',
        a: `Yes. With the ${ui('cuts.modes.contour')} option of the ${ui('cuts.title').toLowerCase()}, each image with a transparent background gets a cut line that follows its shape, to cut out by hand. See the guide to ${link(PATHS.stickers, 'printing stickers at home')}.`,
      },
      {
        q: `Can I open ${app} already set up from a link?`,
        a: `Yes. The guides have buttons that open the editor with the paper, the margin and the photo size ready. A new project is always created: the ones you had stay saved in ${ui('projects.title')}.`,
      },
      {
        q: 'Is the source code available?',
        a: `The source code is published under the PolyForm Noncommercial 1.0.0 license: you can use, study and change it for noncommercial purposes. The full text is in the ${link(PATHS['legal-license'], 'code license')}.`,
      },
    ],
  };
}
