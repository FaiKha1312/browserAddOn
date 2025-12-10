from enum import Enum

class Indices(Enum):
    FLESCH_READING_EASE_GERMAN = "Flesch Reading Ease German"
    ERSTE_WIENER_SACHTEXTFORMEL = "1. Wiener Sachtextformel"
    G_SMOG_INDEX = "G-SMOG Index"
    LIX = "LIX"

class Statistics(Enum):
    SENTENCE_COUNT = "Sentence Count"
    WORD_COUNT = "Word Count"
    CLAUSE_DEPENDENTS = "Clause Dependents"
    
class Text(Enum):
    ORIGINAL = "original"
    TRANSLATIONS = "translations"