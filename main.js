const fs = require('fs');
const parser = require('xml2js');
const nlp = require('compromise');
const wordNet = require('wordnet');
const WordNet = require('node-wordnet');
const sw = require('sentiword');
const xlsx = require('node-xlsx');

const trainingData = __dirname + '/data/training/ABSA16_Restaurants_Train_SB1_v2.xml';

const wordnet = new WordNet();

const inquirer = xlsx.parse(__dirname + '/data/training/inquireraugmented.xls'); // parses a file

fs.readFile(__dirname + '/data/training/WordNet2/WordNet Words & Phrases.CAT', (err, data) => {
  const lexical = {};
  let lastKey = '';
  let start = false;

  data.toString().split('\n').forEach(line => {
    if (line.match(/^\s{0,2}/)[0].length === 0) {
      start = line.indexOf('NOUNS') >= 0;
    }

    if (start) {
      if (line.match(/^\s{0,2}/)[0].length === 1) {
        line = line.replace(/\t/g, '');
        line = line.replace(/\r/g, '');
        lastKey = line;
      } else if (line.match(/^\s{0,2}/)[0].length === 2) {
        line = line.replace(/\t/g, '');
        line = line.replace(/\r/g, '');

        if (!lexical[line.substr(0, line.length - 4)]) {
          lexical[line.substr(0, line.length - 4)] = [];
        }

        lexical[line.substr(0, line.length - 4)].push(lastKey.substr(5));
      }
    }
  });

  fs.readFile(trainingData, (err, data) => {
    parser.parseString(data, (err, result) => {
      //const sentence = result.Reviews.Review[0].sentences[0].sentence[0];
      result.Reviews.Review[0].sentences[0].sentence.forEach(sentence => {
        const sentenceText = sentence.text[0].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

        let text = nlp(sentenceText);
        //let sentiText = sw(sentenceText);

        const words = [];
        const lemmas = {};
        const singulars = [];
        let k = 0;

        text.nouns().data().forEach((noun, index, array) => {
          singulars.push(noun.singular);
          wordnet.lookup(noun.singular, results => {
            results.forEach(result => {
              if (lexical[result.lemma.toUpperCase()] && !lemmas[result.lemma]) {
                lemmas[result.lemma] = lexical[result.lemma.toUpperCase()];
              }
            });

            if (Object.keys(lemmas).length > 0) {
              words.push(noun.singular);
            }

            k++;
            if (k === array.length) {
              const opinions = [];
              sentence.Opinions[0].Opinion.forEach(opinion => {
                opinions.push(opinion['$'].target + ' - ' + opinion['$'].polarity);
              });

              let sentences = [];
              let newSentence = '';
              let add = false;

              text.list[0].terms.forEach(term => {
                if (term.tags.Conjunction) {
                  sentences.push(newSentence);
                  newSentence = '';
                  add = true;
                } else {
                  newSentence += term.text + ' ';
                  add = false;
                }
              });

              if (!add) {
                sentences.push(newSentence);
              }

              let sentencesSW = [];
              sentences.forEach(sentence => {
                // nlp(sentence).debug();
                //console.log('---------');
                //console.log(sentence);
                let sentencePieces = sentence.trim().split(' ');
                let sentencePiecesSW = {};
                sentencePieces.forEach(piece => {
                  sentencePiecesSW[piece] = sw(piece);
                });

                sentencesSW.push(sentencePiecesSW);
              });

              sentencesSW.forEach(s => {
                let pos = 0;
                let neg = 0;
                let sen = '';

                Object.keys(s).forEach(key => {
                  let positive = 0;
                  let negative = 0;

                  if (s[key].words.length === 0) {
                    let exist = false;
                    for (var j = 2; j < inquirer[0].data.length; j++) {
                      var line = inquirer[0].data[j];
                      if (line[0] && line[0].toLowerCase() === key.toLowerCase()) {
                        exist = true;
                        if (line[2] || line[4] || line[5] || line[8]) positive += 1;
                        if (line[3] || line[6] || line[7] || line[10]) negative += 1;
                      }
                    }

                    if (!exist) {
                      // console.log(0, 0);
                    }
                  } else {
                    positive += s[key].positive;
                    negative += s[key].negative;
                  }

                  sen += key + ' ';
                  pos += positive;
                  neg += negative;

                  // console.log('WORD:', key, 'Positive', positive, 'Negative', negative);
                  // console.log();
                });

                console.log(sen);
                console.log(pos, neg);
              });

              // for (var i = 0; i < words.length; i++) {
              //   var word = words[i];
              //   for (var j = 2; j < inquirer[0].data.length; j++) {
              //     var line = inquirer[0].data[j];
              //     if (line[0] && line[0].toLowerCase() === word) {
              //       console.log(word, line[1]);
              //     }
              //   }
              // }

              // console.log(sentiText);
              // console.log('sentiment', sentiFullText.sentiment);
              // for (var i = 0; i < words.length; i++) {
              //   var word = words[i];
              //   for (var j = 0; j < sentiFullText.words.length; j++) {
              //     var sentiWord = sentiFullText.words[j];
              //     if (word === sentiWord.SynsetTerms) {
              //       console.log(word, sentiWord.PosScore, sentiWord.NegScore);
              //       break;
              //     }
              //   }
              // }

              //console.log(sentenceText);
              console.log('words', words);
              console.log('opinions', opinions);
              console.log();
            }
          });
        });
      });
    });
  });
});
