"""Boons, and the buff categories shown on the encounter page.

Only the boons are listed here. Every other buff (offensive, support, defensive) comes from the Elite
Insights output of each encounter, together with its name, icon and category; see eiparser/adapter.py.
"""
import re
from enum import IntEnum


class StackType(IntEnum):
    INTENSITY = 0
    DURATION = 1


class BuffType:
    def __init__(self, name, code, skillid, stacking, capacity):
        self.name = name
        self.code = code
        self.skillid = skillid
        self.stacking = stacking
        self.capacity = capacity


# The codes are the names the buffs are stored under (EncounterBuff.name and the statistics), so they
# must not change.
BUFF_TYPES = [
        BuffType('Might', 'might', [740], StackType.INTENSITY, 25),
        BuffType('Quickness', 'quickness', [1187], StackType.DURATION, 5),
        BuffType('Fury', 'fury', [725], StackType.DURATION, 9),
        BuffType('Protection', 'protection', [717], StackType.DURATION, 5),
        BuffType('Alacrity', 'alacrity', [30328], StackType.DURATION, 9),
        BuffType('Resolution', 'resolution', [873], StackType.DURATION, 5),
        BuffType('Regeneration', 'regen', [718], StackType.DURATION, 5),
        BuffType('Aegis', 'aegis', [743], StackType.DURATION, 5),
        BuffType('Resistance', 'resist', [26980], StackType.DURATION, 5),
        BuffType('Stability', 'stab', [1122], StackType.INTENSITY, 25),
        BuffType('Swiftness', 'swift', [719], StackType.DURATION, 9),
        BuffType('Vigor', 'vigor', [726], StackType.DURATION, 5),
        # Replaced in the game by Resolution (same skill ID); only found in encounters uploaded before that
        BuffType('Retaliation', 'retaliation', [], StackType.DURATION, 5),
    ]

BUFFS = {buff.name: buff for buff in BUFF_TYPES}
BUFF_CODES_BY_ID = {skill_id: buff.code for buff in BUFF_TYPES for skill_id in buff.skillid}

BOON_ORDER = [
    'might',
    'fury',
    'quickness',
    'alacrity',
    'protection',
    'resolution',
    'aegis',
    'regen',
    'swift',
    'vigor',
    'resist',
    'stab',
]
# Encounters analysed before the Elite Insights switch have Retaliation where Resolution is now
LEGACY_BOON_ORDER = ['retaliation' if code == 'resolution' else code for code in BOON_ORDER]

# Buff categories, in display order: (Elite Insights classification, tab ID, tab name).
# These are the tabs of the "Buffs" section of an Elite Insights HTML report.
BOONS_TAB = 'boons'
BUFF_CATEGORIES = [
    ('Boon', BOONS_TAB, 'Boons'),
    ('Offensive', 'offensive_buffs', 'Offensive Buffs'),
    ('Support', 'support_buffs', 'Support Buffs'),
    ('Defensive', 'defensive_buffs', 'Defensive Buffs'),
    ('Gear', 'gear_buffs', 'Gear Buffs'),
    ('Condition', 'conditions', 'Conditions'),
    ('Debuff', 'debuffs', 'Debuffs'),
    ('Nourishment', 'nourishments', 'Nourishments'),
    ('Enhancement', 'enhancements', 'Enhancements'),
    ('Other Consumable', 'other_consumables', 'Other Consumables'),
    # everything EI does not classify; mostly profession specific effects, listed by EI as personal buffs
    ('Other', 'personal_buffs', 'Personal Buffs'),
]
# Categories that are stored with each encounter but not shown yet.
# Personal buffs need their own layout, broken out by profession as in the EI report.
HIDDEN_BUFF_TABS = frozenset(['personal_buffs'])

# The most stacks of the buffs that stack in intensity (their uptime is the average number of stacks, not a
# percentage), by buff code. Elite Insights knows these (the capacity of each buff it declares, in its
# EIData/Buffs/*.cs) but does not put them in its JSON, so they are taken from its source. Buffs it declares with a
# capacity of 0, or of 100 or more (conditions, up to 1500), are left out: the frontend colours those by how the
# squad's players compare. A buff missing here is also compared with the squad.
STACK_CAPACITY = {
    'agony': 25, 'agony_of_the_choir': 25, 'aquatic_aura_kenut': 80, 'aquatic_aura_nikare': 80,
    'ashes_of_the_just': 25, 'bane_signet_pi': 25, 'banished': 25, 'basilisk_venom': 2, 'biting_swarm': 25,
    'blood_fueled_matthias': 15, 'blood_fueled_player': 1, 'bloodstone_fervor': 3, 'bloodstone_volatility': 3,
    'calibrated_essence': 50, 'consumed': 20, 'critical_daredevil_runes': 25, 'crushing_guilt': 10,
    'daring_stance': 25, 'dark_stalker_ritualist': 25, 'dark_stalker_spear': 25, 'deathly_rime': 25,
    'debilitated': 3, 'debilitated_toxic_sickness': 3, 'derangement': 99, 'despair_attunement': 20,
    'devourer_venom': 2, 'devouring_void': 99, 'emboldened': 5, 'envy_attunement': 20,
    'exposed_mordremoth': 25, 'exposed_player': 10, 'extirpation': 25, 'fractal_defensive': 5,
    'fractal_mobility': 5, 'fractal_offensive': 5, 'fractured_allied': 2, 'frozen_wind': 25,
    'gluttony_attunement': 20, 'greer_s_virulence': 5, 'grim_specter_target': 25, 'hamstrung': 99,
    'ice_drake_venom': 4, 'infirmity': 4, 'iron_hide_ram': 1, 'justice_dragonhunter': 25,
    'kryptis_essence': 50, 'kuda_s_cruelty_stacks': 10, 'mabon_s_strength': 10, 'madness': 99,
    'magebane_tether': 25, 'major_sigil_of_benevolence': 25, 'major_sigil_of_bloodlust': 25,
    'major_sigil_of_corruption': 25, 'major_sigil_of_life': 25, 'major_sigil_of_perception': 25,
    'malice_attunement': 20, 'minor_sigil_of_benevolence': 25, 'minor_sigil_of_bloodlust': 25,
    'minor_sigil_of_corruption': 25, 'necrosis': 25, 'nightmare_weapon_shared': 25,
    'nourys_s_hunger_stacks': 10, 'power_of_ancora': 50, 'pulmonary_impact': 25, 'rage_attunement': 20,
    'regret_attunement': 20, 'relic_of_dagda': 1, 'relic_of_fog': 3, 'relic_of_the_aristocracy': 5,
    'relic_of_the_daredevil': 3, 'relic_of_the_herald': 10, 'relic_of_the_monk': 10,
    'relic_of_the_scourge': 10, 'relic_of_the_thief': 5, 'relic_of_thorns': 10, 'relic_of_vass': 3,
    'shredded_armor': 25, 'shrouded': 25, 'signet_of_courage_shared': 25, 'signet_of_judgment_pi': 25,
    'signet_of_mercy_pi': 25, 'signet_of_resolve_shared': 25, 'signet_of_wrath_pi': 25, 'skale_venom': 4,
    'skelk_venom': 5, 'soul_stone_venom': 25, 'spectral_agony': 25, 'spectral_darkness': 10,
    'spider_venom': 6, 'splinter_weapon_shared': 25, 'superior_rune_of_the_monk': 10,
    'superior_sigil_of_benevolence': 25, 'superior_sigil_of_bloodlust': 25, 'superior_sigil_of_bounty': 25,
    'superior_sigil_of_corruption': 25, 'superior_sigil_of_cruelty': 25, 'superior_sigil_of_life': 25,
    'superior_sigil_of_momentum': 25, 'superior_sigil_of_perception': 25, 'superior_sigil_of_the_stars': 25,
    'surveilled_escort': 25, 'taste_for_blood': 25, 'tidal_bargain': 10, 'time_bomb': 25,
    'titanic_potential': 25, 'tyrant_s_fury': 5, 'unblockable': 25, 'unbroken_lines': 3, 'unseen_burden': 99,
    'violent_currents': 5, 'vloxx_s_vision_stacks': 8, 'void_corruption': 10, 'vulnerability': 25,
    'waterlogged': 10, 'weapon_of_warding_shared': 25, 'xinrae_s_weapon_shared': 25,
}

# Tabs that are the same for every encounter; the first is the short list shown on the overview
BUFF_TABS = [
    {
        'name': 'Overview',
        'order': [
            'might',
            'fury',
            'quickness',
            'alacrity',
        ],
    },
    {
        'name': 'Boons',
        'order': BOON_ORDER,
    },
]


def buff_code(skill_id, name):
    """The name a buff is stored under: the fixed code for boons, otherwise derived from the buff's name."""
    code = BUFF_CODES_BY_ID.get(skill_id)
    if code is None:
        code = re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
    return code
