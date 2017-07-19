const fs = require('fs');
const parser = require('xml2js');
const nlp = require('compromise');
const wordNet = require('wordnet');
const WordNet = require('node-wordnet');
const sw = require('sentiword');

const trainingData = __dirname + '/data/training/ABSA16_Restaurants_Train_SB1_v2.xml';

const wordnet = new WordNet();

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
        let sentiText = sw(sentenceText);

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

        sentences.forEach(sentence => {
          // nlp(sentence).debug();
          console.log('---------');
          console.log(sentence);
          console.log(sw(sentence));
          console.log('---------');
        });

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

              console.log(sentenceText);
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
