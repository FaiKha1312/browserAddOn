import json
import math
import readability  # Offers readability measures and other statistics
from bs4 import BeautifulSoup  # HTML Parser
import os
import pandas as pd
import stanza  # Tokenizer, POS Tagger and Dependency Parsing for German Texts
from readability_enums import Indices, Statistics, Text

LANG = "de"
# regular expression for punctuation marks
PUNCTRE = readability.PUNCTRE
# readability indices/measures
INDICES = [index.value for index in Indices]
STATISTICS = [stat.value for stat in Statistics]
# function to count syllables in a word
syllable_counter = readability.LANGDATA[LANG]["syllables"]
# nlp model for German language processing (tokenization, POS tagging, etc.)
# stanza.download(LANG)
nlp = stanza.Pipeline(language=LANG, processors="tokenize,pos,depparse,lemma")


def get_word_count(results):
    """Based on structure of results from readability.getmeasures()"""
    return results["sentence info"]["words"]


def get_sentence_count(results):
    """Based on structure of results from readability.getmeasures()"""
    return results["sentence info"]["sentences"]


def analyse_clause_depentents(doc):
    """Count the occurence of clause dependents in a text based on the
    definition of clause dependents in https://universaldependencies.org/u/dep/"""
    clause_dependent_count = {
        "acl": 0,
        "advcl": 0,
        "ccomp": 0,
        "xcomp": 0,
        "csubj": 0,
        "parataxis": 0,
    }
    for sentence in doc.sentences:
        # match case for acl, advcl, ccomp, xcomp, csubj, parataxis
        for word in sentence.words:
            if word.deprel in clause_dependent_count:
                clause_dependent_count[word.deprel] += 1
    clause_dependent_count["sentence_count"] = len(doc.sentences)
    return clause_dependent_count


def count_monosyllabic_words(text):
    """Count the number of words with only one syllable in a text."""
    # only consider actual words, not punctuation or numbers
    words = [token for token in text.split() if PUNCTRE.match(token) is None]
    return sum(1 for word in words if syllable_counter(word) == 1)


def tokenize_german_text(paragraphs):
    """Takes a list of sentences and returns a single string of tokens and
    counts the occurence of clause dependents in the text."""
    # convert dict list to string
    doc = nlp(" ".join(paragraphs))  
    stanza_tokenizer_result = "\n".join(
        " ".join(token.text for token in sentence.tokens) for sentence in doc.sentences
    )  # join all tokens to a single string
    clause_dependent_count = analyse_clause_depentents(doc)
    return stanza_tokenizer_result, clause_dependent_count


def flesch_reading_ease_german(readability_results):
    """
    Calculates the Flesch Reading Ease score for German texts based on this formula for German texts:
    180 - ASL - (58.8 * ASW)
    where ASL is the average sentence length and ASW is the average number of syllables per word.
    """
    words = get_word_count(readability_results)
    sentences = get_sentence_count(readability_results)
    syllables = readability_results["sentence info"]["syllables"]
    # Calculate ASL, ASW and FRE
    ASW = syllables / words
    ASL = words / sentences
    FRE = 180 - ASL - (58.8 * ASW)
    return FRE


def erste_wiener_sachtextformel(readability_results, tokens):
    """
    Calculates the 1. Wiener Sachtextformel (WSF) for German texts based on the formula:
    0.1935 * MS + 0.1672 * SL + 0.1297 * IW - 0.0327 * ES - 0.875
    where MS is the percentage of words with three or more syllables,
    SL is the average sentence length,
    IW is the percentage of words with more than six letters and
    ES is the percentage of monosyllabic words.
    """
    total_long_words = readability_results["sentence info"]["long_words"]
    total_words = get_word_count(readability_results)
    total_complex_words = readability_results["sentence info"]["complex_words"]
    total_sentences = get_sentence_count(readability_results)
    IW = total_long_words / total_words * 100
    MS = total_complex_words / total_words * 100
    SL = total_words / total_sentences
    ES = count_monosyllabic_words(tokens) / total_words * 100

    WSF = 0.1935 * MS + 0.1672 * SL + 0.1297 * IW - 0.0327 * ES - 0.875
    return WSF


def smog_index_german(readability_results):
    """
    Calculates the G-SMOG Index for German texts based on the formula:
    sqrt((30 * MS) / S) - 2.0
    where MS is the number of complex words and
    S is the number of sentences.
    The formula is derived from the SMOG Index formula for English texts
    (https://www.uni-regensburg.de/assets/sprache-literatur-kultur/germanistik-did/RATTE_Dokumentation_2.pdf).
    """
    total_complex_words = readability_results["sentence info"]["complex_words"]
    total_sentences = get_sentence_count(readability_results)
    g_smog = math.sqrt((total_complex_words * 30) / total_sentences) - 2.0
    return g_smog


def evaluate_readability_for_file(filename):
    """
    Reads the original texts and the Easy Language translations from a file,
    evaluates the readability and writes the results back to the file.
    The file has a JSON structure as follows:
        {
            website: "www.example.com",
            model: "model_name",
            translations: {
            "original text": "easy language translation",
              ...
            }
        }
    """
    # open file and read content from JSON
    with open(filename, "r", encoding="utf-8") as file:
        content = json.load(file)

    # tokenize original text and translations
    original_tokens, original_clause_dependents = tokenize_german_text(
        content[Text.TRANSLATIONS.value].keys()
    )
    translations = [
        BeautifulSoup(translation.replace("<br>", ""), "html.parser").get_text()
        for translation in content[Text.TRANSLATIONS.value].values()
    ]
    translation_tokens, translations_clause_dependents = tokenize_german_text(
        translations
    )

    # calculate readability results
    readability_results_original = get_readability_scores(original_tokens)
    readability_results_translations = get_readability_scores(translation_tokens)

    # add results to json file
    content["readability_results_original"] = readability_results_original
    content["readability_results_original"][
        Statistics.CLAUSE_DEPENDENTS.value
    ] = original_clause_dependents
    content["readability_results_translations"] = readability_results_translations
    content["readability_results_translations"][
        Statistics.CLAUSE_DEPENDENTS.value
    ] = translations_clause_dependents
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(content, file, indent=2, ensure_ascii=False)


def get_readability_scores(tokens):
    """
    Calculates the readability scores for a given text and returns them as a dictionary.
    Includes: Flesch Reading Ease German, 1. Wiener Sachtextformel, G-SMOG Index, LIX, Sentence Count, Word Count.
    """
    results = readability.getmeasures(tokens, lang=LANG)
    FREG = flesch_reading_ease_german(results)
    WSF = erste_wiener_sachtextformel(results, tokens)
    GSMOG = smog_index_german(results)
    readability_results = {
        Indices.FLESCH_READING_EASE_GERMAN.value: FREG,
        Indices.ERSTE_WIENER_SACHTEXTFORMEL.value: WSF,
        Indices.G_SMOG_INDEX.value: GSMOG,
        Indices.LIX.value: results["readability grades"][Indices.LIX.value],
        Statistics.SENTENCE_COUNT.value: get_sentence_count(results),
        Statistics.WORD_COUNT.value: get_word_count(results),
    }
    return readability_results


def evaluate_readability_from_files(filenames=None):
    """
    Reads all files given in the 'filenames' list or all in the predefined directory, 
    and evaluates the readability of the texts in these files.
    """
    # get files from "translations" folder
    files = filenames
    if files is None:
        translations_directory = "readability evaluation/easy language"
        files = [f"{translations_directory}/{file}" for file in os.listdir(translations_directory)]
    print("Evaluating files: ", files)
    for file in files:
        evaluate_readability_for_file(file)
    print("Evaluation finished.")


def calculate_statistics():
    """
    Calculates the average readability scores for each LLM model based on the evaluation saved in 'translations' files.
    """
    # get files from given directory
    translations_directory = "readability evaluation/easy language"
    files = [f"{translations_directory}/{file}" for file in os.listdir(translations_directory)]
    model_scores = {}  # dictionary to store readability scores for each model
    for file in files:
        # check if file exists
        if not os.path.exists(file):
            continue
        model = file.split("_")[1]
        if model not in model_scores:
            model_scores[model] = {Text.TRANSLATIONS.value: {}, Text.ORIGINAL.value: {}}
            model_scores[model]["website"] = []
        with open(file, "r", encoding="utf-8") as f:
            content = json.load(f)
            model_scores[model]["website"].append(content["website"])

        # add readability scores/indices to model_scores dictionary
        add_readability_scores(model_scores[model], content, Text.TRANSLATIONS.value)
        add_readability_scores(model_scores[model], content, Text.ORIGINAL.value)

    # calculate average readability scores for each model
    for model in model_scores:
        for key in [Text.TRANSLATIONS.value, Text.ORIGINAL.value]:
            for index in INDICES:
                scores = model_scores[model][key][index]
                model_scores[model][f"{index}_{key}_avg"] = (
                    sum(scores) / len(scores) if scores else 0
                )
            sentence_counts = model_scores[model][key][Statistics.SENTENCE_COUNT.value]
            model_scores[model][f"{Statistics.SENTENCE_COUNT.value}_{key}_avg"] = (
                sum(sentence_counts) / len(sentence_counts) if sentence_counts else 0
            )
            word_counts = model_scores[model][key][Statistics.WORD_COUNT.value]
            model_scores[model][f"{Statistics.WORD_COUNT.value}_{key}_avg"] = (
                sum(word_counts) / len(word_counts) if word_counts else 0
            )
            

    # save statistics to csv file
    df = pd.DataFrame.from_dict(model_scores, orient="index")
    df.reset_index(inplace=True)
    df.rename(columns={"index": "LLM Model"}, inplace=True)
    df.to_csv("readability_scores_easy_language.csv", index=False)


def add_readability_scores(model_scores, content, key):
    for index in INDICES:
        if index not in model_scores[key]:
            model_scores[key][index] = []
        model_scores[key][index].append(content[f"readability_results_{key}"][index])
    if Statistics.SENTENCE_COUNT.value not in model_scores[key]:
        model_scores[key][Statistics.SENTENCE_COUNT.value] = []
    model_scores[key][Statistics.SENTENCE_COUNT.value].append(
        content[f"readability_results_{key}"][Statistics.SENTENCE_COUNT.value]
    )
    if Statistics.WORD_COUNT.value not in model_scores[key]:
        model_scores[key][Statistics.WORD_COUNT.value] = []
    model_scores[key][Statistics.WORD_COUNT.value].append(
        content[f"readability_results_{key}"][Statistics.WORD_COUNT.value]
    )


# if main file, run the evaluation
if __name__ == "__main__":
    # and calculate readability scores and sentqence structure
    evaluate_readability_for_file("readability evaluation/discussion/translations_gpt-4o_full_context_changed_prompt.json")
    # calculate statistics (average values/scores of each llm model over all texts)
    # based on evaluation saved in 'translations_' files and save to csv
    #calculate_statistics()
