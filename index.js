const jsdom = require('jsdom');
const download = require('download-file');
const Promise = require('bluebird');
const imagesToPdf = require("images-to-pdf")
const fetch = require('node-fetch')
const argv = require('yargs').argv

const { JSDOM } = jsdom;
async function fetchChapterPictures(url) {
  const options = {};
  return new Promise((rs, rj) => {
    JSDOM.fromURL(url, options).then(dom => {
      const chapterPicDoms = dom.window.document.querySelectorAll('.page-chapter img');
      const length = chapterPicDoms.length;
      const chapterPics = [];
      for (let i = 0; i < length; i += 1) {
        const pic = chapterPicDoms.item(i).attributes.getNamedItem('src').value;
        if (pic) { chapterPics.push(pic); }
      }
      // console.log('got: ', chapterPics);
      rs(chapterPics);
    }).catch((err) => rj(err));
  })
}

function generateOutputFolderName(url) {
  const parts = url.split('/');
  const len = parts.length;
  // chua_te_hoc_duong_chap_171_84704
  return `${parts[len-3]}_${parts[len-2]}_${parts[len-1]}`.replace('-', '_');
}

function parseFileNameFromPictureUrl(url) {
  if (url.includes('/proxy.truyen.cloud/?data=')) {
    const data = url.replace('//proxy.truyen.cloud/?data=', '');
    return data.replace(/\//g, '_');
  } else {
    const parts = url.split('/');
    const len = parts.length;
    return `${parts[len-1]}`;
  }
}

async function downloadPic(url, folder) {
  const filename = parseFileNameFromPictureUrl(url);
  const directory = `./images/${folder}`;
  console.log(`download ${filename} to ${directory}: `, url);
  return new Promise((rs, rj) => {
    const options = { directory, filename };
    download(url, options, (err) => {
      if (err) {
        console.log(`download ${filename} ERR`, err);
        rj(err);
      }
      rs(`${directory}/${filename}`);
    })
  })
}

async function downloadPictures(pics, folderName) {
  console.log('downloading pictures to folder ', folderName);
  return Promise
    .map(pics, (pic) => {
      return downloadPic(pic, folderName);
    }, { concurrency: 10 });
}

async function generatePdfFile(paths, folderName) {
  const output = `./pdf/${folderName}.pdf`;
  await imagesToPdf(paths, output)

}

function generatePathFromPics(pics, folderName) {
  const paths = [];
  for (let i = 0; i < pics.length; i+= 1) {
    paths.push(`./images/${folderName}/${parseFileNameFromPictureUrl(pics[i])}`);
  }
  return paths;
}

async function fetchChapters(url) {
  const paths = url.split('/');
  const chapterId = paths[paths.length - 1];
  return new Promise((rs, rj) => {
    fetch("http://www.nettruyen.com/Comic/Services/ComicService.asmx/ProcessChapterLoader", {
      "credentials": "include",
      "headers": {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
        "content-type": "application/x-www-form-urlencoded"
      },
      "referrerPolicy": "no-referrer",
      "body": `chapterId=${chapterId}&commentId=-1`,
      "method": "POST",
      "mode": "cors"
    }).then(res => res.text())
      .then(res => JSON.parse(res))
      .then(body => {
        rs(body.chapters);
      })
      .catch(err => rj(err));
  })
}

function chapterToURLS(chapters) {
  return chapters.map((chapter) => 'http://www.nettruyen.com' + chapter.url);
}


async function downloadChapter(url) {
  const pics = await fetchChapterPictures(url);
  const folderName = generateOutputFolderName(url);
  await downloadPictures(pics, folderName);
  const paths = generatePathFromPics(pics, folderName);
  await generatePdfFile(paths, folderName);
  console.log(`___DOWNLOAD CHAPTER SUCCESS ${url}___`);
}

async function sleep(ms) {
  return new Promise((rs, rj) => {
    setTimeout(() => rs(true), ms);
  });
}

function checkURL(url) {
  return url.includes('http://www.nettruyen.com/truyen-tranh/');
}

async function main() {
  if (argv._ && argv._[0]) {
    const url = argv._[0];
    if (checkURL(url)) {
      const chapters = await fetchChapters(url);
      const urls = chapterToURLS(chapters);
      let i = 0;
      while (i < urls.length) {
        try {
          console.log(`process ${i}: `, urls[urls.length - i - 1])
          await downloadChapter(urls[urls.length - i - 1])
          i += 1;
        } catch (e) {
          console.log(`process chapter failed! retry after 3s`, e);
          await sleep(3000);
        }
      }
    } else {
      console.log('URL must be like: http://www.nettruyen.com/truyen-tranh/chua-te-hoc-duong/chap-173/84706')
    }
  } else {
    console.log('USAGE: npm install && node index.js url_to_net_truyen')
  }
}

main();
