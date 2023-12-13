const express = require("express");
const fs = require('fs')
const uuid = require('uuid');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const cheerio = require('cheerio');
const cors = require('cors')
const home = require("./routes/home");

const app = express();
app.use(cors())
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

function generateFileName() {
  return uuid.v4();
}

const result = {
  url: "",
  emails: [],
  phones: [],
  linkedin: [],
  facebook: [],
  twitter: [],
  instagram: [],
};

const crawl = async (url, depth, maxDepth, baseUrl) => {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    result.url = baseUrl;
    result.emails.push(...$('a[href^="mailto:"]').map((_, element) => $(element).attr('href').replace('mailto:', '')).get());
    result.phones.push(...$('a[href^="tel:"]').map((_, element) => $(element).attr('href').replace('tel:', '')).get());
    result.linkedin.push(...$('a[href*="linkedin.com"]').map((_, element) => $(element).attr('href')).get());
    result.facebook.push(...$('a[href*="facebook.com"]').map((_, element) => $(element).attr('href')).get());
    result.twitter.push(...$('a[href*="twitter.com"]').map((_, element) => $(element).attr('href')).get());
    result.instagram.push(...$('a[href*="instagram.com"]').map((_, element) => $(element).attr('href')).get());

    if (depth < maxDepth) {
      const nextPageUrls = $('a').map((_, element) => $(element).attr('href')).get();
      const absoluteNextPageUrls = nextPageUrls.map((nextUrl) => new URL(nextUrl, baseUrl).href);

      for (const nextPageUrl of absoluteNextPageUrls) {
        await crawl(nextPageUrl, depth + 1);
      }
    }
  } catch (error) {
    return;
  }
};

function removeDuplicates(arr) {
  return [...new Set(arr)]
}

function cleanResult(result) {
  result.emails = removeDuplicates(result.emails);
  result.phones = removeDuplicates(result.phones);
  result.facebook = removeDuplicates(result.facebook);
  result.linkedin = removeDuplicates(result.linkedin);
  result.twitter = removeDuplicates(result.twitter);
  result.instagram = removeDuplicates(result.instagram);

  return result
}


const crawlAndReturnResult = async (baseUrl, maxDepth) => {
  await crawl(baseUrl, 0, maxDepth, baseUrl);
  return cleanResult(result);
};


const convertToCsv = (data, fileId) => {
  const createFormattedString = (data) => {
    const { url, emails, phones, linkedin, facebook, twitter, instagram } = data;
  
    const emailsLength = emails.length
    const linkedinLength = linkedin.length
    const phonesLength = phones.length
    const facebookLength = facebook.length
    const instagramLength = instagram.length
    const twitterLength = twitter.length
  
    const maxLength = Math.max(emailsLength, linkedinLength, phonesLength, facebookLength, instagramLength, twitterLength )
  
    let formattedString = `url;emails;phones;linkedin;facebook;twitter;instagram\n`;
  
    for (let i = 0; i < maxLength; i++) {
      formattedString += `${url};${i < emails.length ? emails[i] : ""};${i < phones.length ? phones[i] : ""};${i < linkedin.length ? linkedin[i] : ""};${i < facebook.length ? facebook[i] : ""};${i < twitter.length ? twitter[i] : ""};${i < instagram.length ? instagram[i] : ""}\n`
    }
  
    return formattedString;
  };
  
  const resultString = createFormattedString(data);
  
  const fileName = `./uploads/data-${fileId}-collected.csv`;
  
  fs.readFile(fileName, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.writeFile(fileName, resultString, 'utf8', (err) => {
          if (err) {
            console.error('Ошибка при создании файла:', err);
          } else {
            console.log('Файл успешно создан и записан.');
          }
        });
      } else {
        console.error('Ошибка при чтении файла:', err);
      }
    } else {
      // Если файл существует, дописываем строку
      fs.appendFile(fileName, resultString, 'utf8', (err) => {
        if (err) {
          console.error('Ошибка при записи в файл:', err);
        } else {
          console.log('Строка успешно добавлена в файл.');
        }
      });
    }
  });
}

const addToCsvFile = (data, fileId) => {
  const createFormattedString = (dataArray) => {
    let formattedString = `url;emails;phones;linkedin;facebook;twitter;instagram\n`;
  
    dataArray.forEach(data => {
      const { url, emails, phones, linkedin, facebook, twitter, instagram } = data;
  
      const maxLength = Math.max(emails.length, linkedin.length, phones.length, facebook.length, instagram.length, twitter.length);
  
      for (let i = 0; i < maxLength; i++) {
        formattedString += `${url};${i < emails.length ? emails[i] : ""};${i < phones.length ? phones[i] : ""};${i < linkedin.length ? linkedin[i] : ""};${i < facebook.length ? facebook[i] : ""};${i < twitter.length ? twitter[i] : ""};${i < instagram.length ? instagram[i] : ""}\n`
      }
    });
  
    return formattedString;
  };

  const resultString = createFormattedString(data);
  
  const fileName = `./uploads/data-${fileId}-collected.csv`;

  fs.readFile(fileName, 'utf8', (err, existingData) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.writeFile(fileName, resultString, 'utf8', (err) => {
          if (err) {
            console.error('Ошибка при создании файла:', err);
          } else {
            console.log('Файл успешно создан и записан.');
          }
        });
      } else {
        console.error('Ошибка при чтении файла:', err);
      }
    } else {
      fs.appendFile(fileName, resultString, 'utf8', (err) => {
        if (err) {
          console.error('Ошибка при записи в файл:', err);
        } else {
          console.log('Строка успешно добавлена в файл.');
        }
      });
    }
  });
}

app.use("/home", home);

app.get('/scrape', async (req, res) => {
  const targetUrl = req.query.targetUrl;
  const depth = req.query.depth;

  try {
    const result = await crawlAndReturnResult(targetUrl, depth);
    return res.status(200).json(result);
  } catch (error) {
    let errorMessage = 'An error occurred while scraping the page.';

    if (error.name === 'AbortError') {
      errorMessage = `Timeout error scraping ${targetUrl}.`;
    } else {
      errorMessage = `Error scraping ${targetUrl}: ${error.message || error}`;
    }

    return res.status(500).json({ error: errorMessage });
  }
});

app.post('/csv', async (req, res) => {
  const fileId = generateFileName();
  const result = req.body;

  convertToCsv(result, fileId);

  return res.status(200).json({ fileId })
})

app.get('/download/:fileId', (req, res) => {
  const { fileId } = req.params
  return res.download(`./uploads/data-${fileId}-collected.csv`)
});

app.post('/add-csv', (req, res) => {
  const fileId = generateFileName();
  const result = req.body

  addToCsvFile(result, fileId);

  return res.status(200).json({ fileId })
})

const uploadFolderPath = path.join(__dirname, 'uploads');

const deleteFilesInUploads = () => {
  fs.readdir(uploadFolderPath, (err, files) => {
    if (err) {
      console.error('Ошибка при чтении директории:', err);
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(uploadFolderPath, file);

      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error('Ошибка при удалении файла:', unlinkErr);
        } else {
          console.log(`Файл ${file} удален успешно.`);
        }
      });
    });
  });
};

cron.schedule('0 0 * * *', () => {
  deleteFilesInUploads();
});

const port = process.env.PORT || 9001;
app.listen(port, () => console.log(`Listening to port ${port}`));
