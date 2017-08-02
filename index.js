require('./stopwords');

const fs = require('fs');
const parser = require('xml2js');
const natural = require('natural');
const path = require('path');
const emotional = require('emotional');

var tokenizer = new natural.WordTokenizer();
var nounInflector = new natural.NounInflector();
var wordnet = new natural.WordNet();

var base_folder = path.join(path.dirname(require.resolve('natural')), 'brill_pos_tagger');
var rulesFilename = base_folder + '/data/English/tr_from_posjs.txt';
var lexiconFilename = base_folder + '/data/English/lexicon_from_posjs.json';
var defaultCategory = 'N';

var lexicon = new natural.Lexicon(lexiconFilename, defaultCategory);
var rules = new natural.RuleSet(rulesFilename);
var tagger = new natural.BrillPOSTagger(lexicon, rules);

const trainingData = __dirname + '/data/training/ABSA16_Restaurants_Train_SB1_v2.xml';

// Lexical Wordnet
const data = fs.readFileSync(__dirname + '/data/training/WordNet2/WordNet Words & Phrases.CAT');
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

emotional.load(() => {
  fs.readFile(trainingData, (err, data) => {
    parser.parseString(data, (err, result) => {
      //const sentence = result.Reviews.Review[0].sentences[0].sentence[0];
      // Each sentence of a review (first one)
      let total = [0, 0];
      result.Reviews.Review.forEach(review => {
        let positives = 0;
        review.sentences[0].sentence.forEach(sentence => {
          // Get the text and remove stopwords
          const text = sentence.text[0].removeStopWords();
          // Tokenization [text to array]
          const tokens = tokenizer.tokenize(text);

          // Singularize each token
          tokens.forEach((token, index) => {
            tokens[index] = nounInflector.singularize(token);
          });

          // Split sentence in conjunctions
          let sentences = [];
          let newSentence = '';
          let add = false;
          tagger.tag(tokens).forEach(token => {
            if (token[1] === 'CC') {
              sentences.push(newSentence);
              newSentence = '';
              add = true;
            } else {
              newSentence += token[0] + ' ';
              add = false;
            }
          });

          if (!add) {
            sentences.push(newSentence);
          }

          // Get all the nouns with more than one in Lexical Categories
          const aspects = [];
          //console.log(tagger.tag(tokens));
          tagger.tag(tokens).forEach(token => {
            if (
              token[1] === 'NN' &&
              lexical[token[0].toUpperCase()] &&
              lexical[token[0].toUpperCase()].length > 1
            ) {
              aspects.push(token[0]);
            }
          });

          // Get all aspect from database to compare
          const opinionAspects = [];
          const opinionPolarity = [];
          if (sentence.Opinions) {
            const opinions = sentence.Opinions[0].Opinion;
            opinions.forEach(opinion => {
              opinionAspects.push([opinion['$'].target, opinion['$'].polarity === 'positive']);
            });

            // const senti = emotional.get(text);
            // sentences.forEach(sentence => {
            //   aspects.forEach(aspect => {
            //     if (sentence.indexOf(aspect) >= 0) {
            //       console.log(aspect, senti.polarity, emotional.get(sentence).polarity);
            //     }
            //   });
            // });

            const senti = emotional.positive(text);
            const results = [];
            aspects.forEach(aspect => {
              results.push([aspect, senti]);
            });
            //console.log(results);
            //console.log(opinionAspects);

            const compare = [];
            opinionAspects.forEach(o => {
              results.forEach(r => {
                if (natural.JaroWinklerDistance(r[0], o[0]) >= 0.9) {
                  if (r[1] === o[1]) {
                    compare.push(true);
                  } else {
                    compare.push(false);
                  }
                }
              });
            });

            let allPositive = true;
            results.forEach(r => {
              if (!r) allPositive = false;
            });

            if (allPositive) {
              positives++;
            }

            //console.log(compare);

            // console.log(opinionPolarity);

            // console.log('polarity', senti.polarity);
            // console.log('words', senti.assessments);

            //console.log();
          }
        });

        console.log(
          'Quantity of sentences:',
          positives + '/' + review.sentences[0].sentence.length
        );
        total[0] += positives;
        total[1] += review.sentences[0].sentence.length;
      });

      console.log(total);
    });
  });
});
