"""Top Australian merchant list for the merchant classifier head.

Top-100 merchants by transaction volume in Australian personal finance.
Index 0-99 = known merchants, index 100 = "other" (unknown/rare merchant).
"""

# Top-100 AU merchants ordered by estimated transaction frequency.
# Index in this list = class label for the merchant classifier head.
MERCHANT_LIST: list[str] = [
    # Supermarkets (0-4)
    "Woolworths",
    "Coles",
    "ALDI",
    "IGA",
    "Harris Farm Markets",
    # Department / Variety (5-9)
    "Kmart",
    "Target",
    "Big W",
    "Myer",
    "David Jones",
    # Fuel (10-14)
    "Shell",
    "BP",
    "Caltex",
    "7-Eleven",
    "Ampol",
    # Fast Food (15-24)
    "McDonald's",
    "KFC",
    "Hungry Jack's",
    "Subway",
    "Domino's",
    "Guzman y Gomez",
    "Nando's",
    "Oporto",
    "Red Rooster",
    "Grill'd",
    # Coffee / Cafe (25-29)
    "The Coffee Club",
    "Gloria Jean's",
    "Starbucks",
    "Muffin Break",
    "Jamaica Blue",
    # Transport (30-34)
    "Uber",
    "DiDi",
    "Opal",  # Sydney transport card
    "Myki",  # Melbourne transport card
    "Go Card",  # Brisbane transport card
    # Ride/Delivery (35-39)
    "Uber Eats",
    "DoorDash",
    "Menulog",
    "Deliveroo",
    "Fantuan",
    # Hardware / Home (40-44)
    "Bunnings",
    "IKEA",
    "Officeworks",
    "JB Hi-Fi",
    "Harvey Norman",
    # Health / Pharmacy (45-49)
    "Chemist Warehouse",
    "Priceline Pharmacy",
    "Terry White",
    "Blooms The Chemist",
    "Amcal",
    # Telco / Utilities (50-54)
    "Telstra",
    "Optus",
    "Vodafone",
    "AGL",
    "Origin Energy",
    # Insurance / Finance (55-59)
    "NRMA",
    "RACV",
    "Medibank",
    "Bupa",
    "HCF",
    # Streaming / Digital (60-64)
    "Netflix",
    "Spotify",
    "Apple",
    "Google",
    "Amazon",
    # Fashion / Apparel (65-69)
    "Cotton On",
    "Uniqlo",
    "H&M",
    "Zara",
    "Country Road",
    # Pet / Specialty (70-74)
    "PETstock",
    "Petbarn",
    "Best & Less",
    "Rebel Sport",
    "Anaconda",
    # Liquor (75-79)
    "Dan Murphy's",
    "BWS",
    "Liquorland",
    "First Choice Liquor",
    "Vintage Cellars",
    # Bakery / Food Specialty (80-84)
    "Bakers Delight",
    "Brumby's",
    "Sumo Salad",
    "Boost Juice",
    "Chatime",
    # Fitness / Wellness (85-89)
    "Anytime Fitness",
    "Fitness First",
    "F45 Training",
    "Jetts",
    "Virgin Active",
    # Auto (90-94)
    "Supercheap Auto",
    "Repco",
    "Beaurepaires",
    "Bridgestone",
    "mycar",
    # Misc High-Frequency (95-99)
    "Australia Post",
    "Coles Express",
    "Costco",
    "Aldi Mobile",
    "Catch.com.au",
]

# Sentinel for unknown/rare merchants
OTHER_CLASS_INDEX = len(MERCHANT_LIST)  # 100
NUM_MERCHANT_CLASSES = OTHER_CLASS_INDEX + 1  # 101

# Build lookup for label encoding
MERCHANT_TO_INDEX: dict[str, int] = {
    name.lower(): idx for idx, name in enumerate(MERCHANT_LIST)
}


def merchant_to_label(merchant_name: str) -> int:
    """Convert a merchant name to its class index (case-insensitive).

    Returns OTHER_CLASS_INDEX if the merchant is not in the top-100 list.
    """
    return MERCHANT_TO_INDEX.get(merchant_name.lower().strip(), OTHER_CLASS_INDEX)


def label_to_merchant(label: int) -> str:
    """Convert a class index back to the merchant name.

    Returns "Other" for the unknown class.
    """
    if 0 <= label < len(MERCHANT_LIST):
        return MERCHANT_LIST[label]
    return "Other"
