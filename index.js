require('./stopwords');

const fs = require('fs');
const parser = require('xml2js');
const natural = require('natural');
const path = require('path');
const emotional = require('emotional');

var tokenizer = new natural.WordTokenizer();
var nounInflector = new natural.NounInflector();
var wordnet = new natural.WordNet();
var classifier = new natural.BayesClassifier();

var base_folder = path.join(path.dirname(require.resolve('natural')), 'brill_pos_tagger');
var rulesFilename = base_folder + '/data/English/tr_from_posjs.txt';
var lexiconFilename = base_folder + '/data/English/lexicon_from_posjs.json';
var defaultCategory = 'N';

var lexicon = new natural.Lexicon(lexiconFilename, defaultCategory);
var rules = new natural.RuleSet(rulesFilename);
var tagger = new natural.BrillPOSTagger(lexicon, rules);

const trainingData = __dirname + '/data/training/ABSA16_Restaurants_Train_SB1_v2.xml';
const testData = __dirname + '/data/test/EN_REST_SB1_TEST.xml.gold';

// Lexical Wordnet
const data = fs.readFileSync(__dirname + '/data/training/WordNet2/WordNet Words & Phrases.CAT');
const lexical = {};
let lastKey = '';
let start = false;

// Transform Lexical Wornet in Hashmap
const lexicalWordnet = () => {
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
};

const trainClassifier = callback => {
  fs.readFile(trainingData, (err, data) => {
    parser.parseString(data, (err, result) => {
      result.Reviews.Review.forEach(review => {
        review.sentences[0].sentence.forEach(sentence => {
          if (sentence.Opinions) {
            const opinions = sentence.Opinions[0].Opinion;
            opinions.forEach(opinion => {
              classifier.addDocument(opinion['$'].target, opinion['$'].polarity);
            });
          }
        });
      });

      classifier.train();

      return callback();
    });
  });
};

const sentimentAnalysis = () => {
  emotional.load(() => {
    fs.readFile(trainingData, (err, data) => {
      parser.parseString(data, (err, result) => {
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

            // Get all the nouns with more than one in Lexical Categories
            const aspects = [];
            tagger.tag(tokens).forEach(token => {
              if (token[0].length >= 3 && token[1] === 'NN' && lexical[token[0].toUpperCase()] && lexical[token[0].toUpperCase()].length > 1) {
                aspects.push(token[0]);
              }
            });

            const opinionAspects = [];
            const opinionPolarity = [];
            if (sentence.Opinions) {
              // Get all aspect from database to compare
              const opinions = sentence.Opinions[0].Opinion;
              if (opinions) {
                let c = [];
                opinions.forEach(opinion => {
                  if (opinion['$'].target !== 'NULL') {
                    opinionAspects.push([opinion['$'].target, opinion['$'].polarity]);
                    c.push(opinion['$'].target);
                  }
                });

                console.log('opinions', aspects);
                console.log('opinionAspects', c);

                const results = [];

                // Get the emotional from text
                const senti = emotional.get(text);
                const neutralThreshold = 0.0;

                aspects.forEach(aspect => {
                  // If emotional is not empty get polarity
                  if (senti.assessments.length > 0) {
                    let polarity = 'neutral';
                    if (senti.polarity >= neutralThreshold) polarity = 'positive';
                    else if (senti.polarity <= -neutralThreshold) polarity = 'negative';

                    results.push([aspect, polarity]);
                  } else {
                    // If emotional is empty classify with Bayes
                    results.push([aspect, classifier.classify(aspect)]);
                  }
                });

                // Compare the emotional with the database
                const compare = [];
                opinionAspects.forEach(o => {
                  results.forEach(r => {
                    if (natural.JaroWinklerDistance(r[0], o[0]) >= 0.9) {
                      // console.log(r[0], r[1], o[1]);
                      if (r[1] === o[1]) {
                        compare.push(true);
                      } else {
                        compare.push(false);
                      }
                    }
                  });
                });

                // Count
                let allPositive = true;
                compare.forEach(r => {
                  if (!r) allPositive = false;
                });

                if (allPositive && compare.length > 0) {
                  positives++;
                }
              }
            }
          });

          total[0] += positives;
          total[1] += review.sentences[0].sentence.length;
        });

        console.log(total);
      });
    });
  });
};

trainClassifier(() => {
  lexicalWordnet();
  sentimentAnalysis();
});
