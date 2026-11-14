from enum import IntEnum

class StackType(IntEnum):
    INTENSITY = 0
    DURATION = 1

class BuffType:
    def __init__(self, name, code, skillid, stacking, capacity, arch_uptime = 100000000, arch_support_power = 0):
        self.name = name
        self.code = code
        self.skillid = skillid
        self.stacking = stacking
        self.capacity = capacity
        self.arch_uptime = arch_uptime
        self.arch_support_power = arch_support_power
        
BUFF_TYPES = [
        # General Boons
        BuffType('Might', 'might', [740], StackType.INTENSITY, 25, 40, 5),
        BuffType('Quickness', 'quickness', [1187], StackType.DURATION, 5, 150, 5),
        BuffType('Fury', 'fury', [725], StackType.DURATION, 9, 150, 1),
        BuffType('Protection', 'protection', [717], StackType.DURATION, 5, 200, 2),
        BuffType('Alacrity', 'alacrity', [30328], StackType.DURATION, 9, 150, 5),
        BuffType('Retaliation', 'retaliation', [873], StackType.DURATION, 5),
        BuffType('Regeneration', 'regen', [718], StackType.DURATION, 5),
        BuffType('Aegis', 'aegis', [743], StackType.DURATION, 5),
        BuffType('Resistance', 'resist', [26980], StackType.DURATION, 5),
        BuffType('Stability', 'stab', [1122], StackType.INTENSITY, 25),
        BuffType('Swiftness', 'swift', [719], StackType.DURATION, 9),
        BuffType('Vigor', 'vigor', [726], StackType.DURATION, 5),

        # Ranger
        BuffType('Spotter', 'spotter', [14055], StackType.DURATION, 1, 1, 1),
        BuffType('Spirit of Frost', 'spirit_of_frost', [12544, 50421], StackType.DURATION, 1, 1, 2),
        BuffType('Sun Spirit', 'sun_spirit', [12540, 50413], StackType.DURATION, 1, 1, 2),
        BuffType('Stone Spirit', 'stone_spirit', [12547, 50415], StackType.DURATION, 1),
        BuffType('Storm Spirit', 'storm_spirit', [12549, 50381], StackType.DURATION, 1, 1, 2),
        BuffType('Glyph of Empowerment', 'glyph_of_empowerment', [31803], StackType.DURATION, 1, 1, 1),

        # Warrior
        BuffType('Empower Allies', 'empower_allies', [14222], StackType.DURATION, 1, 1, 1),
        BuffType('Banner of Strength', 'banner_strength', [14417], StackType.DURATION, 1, 1, 2),
        BuffType('Banner of Discipline', 'banner_discipline', [14449], StackType.DURATION, 1, 1, 2),
        BuffType('Banner of Tactics', 'banner_tactics', [14450], StackType.DURATION, 1, 1, 2),
        BuffType('Banner of Defence', 'banner_defence', [14543], StackType.DURATION, 1, 1, 2),

        # Revenant
        BuffType('Assassin''s Presence', 'assassins_presence', [26854], StackType.DURATION, 1, 1, 1),
        BuffType('Naturalistic Resonance', 'naturalistic_resonance', [29379], StackType.DURATION, 1, 150, 2),

        # Engineer
        BuffType('Pinpoint Distribution', 'pinpoint_distribution', [38333], StackType.DURATION, 1, 1, 2),

        # Elementalist
        BuffType('Soothing Mist', 'soothing_mist', [5587], StackType.DURATION, 1, 1, 5),

        # Necro
        BuffType('Vampiric Presence', 'vampiric_presence', [30285], StackType.DURATION, 1, 1, 1),
    
        # Thief
        BuffType('Lotus Training', 'lotus_training', [32200], StackType.DURATION, 1),
        BuffType('Lead Attacks', 'lead_attacks', [34659], StackType.INTENSITY, 15),
    
        # Guardian
        BuffType('Strength in Numbers','strength_in_numbers',[13796],StackType.DURATION, 1, 1, 1)
    
    #Future boon ids
    #Aegis - 743
    ]

BUFFS = { buff.name: buff for buff in BUFF_TYPES }
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
        'order': [
            'might',
            'fury',
            'quickness',
            'alacrity',
            'retaliation',
            'protection',
            'aegis',
            'regen',
            'swift',
            'vigor',
            'resist',
            'stab',
        ],
    },
    {
        'name': 'Offensive Buffs',
        'order': [
            'spirit_of_frost',
            'sun_spirit',
            'spotter',
            'banner_strength',
            'banner_discipline',
            'empower_allies',
            'glyph_of_empowerment',
            'assassins_presence',
            'pinpoint_distribution',
        ],
    },
    {
        'name': 'Supportive Buffs',
        'order': [
            'stone_spirit',
            'banner_tactics',
            'banner_defence',
            'storm_spirit',
            'naturalistic_resonance',
            'soothing_mist',
            'vampiric_presence',
            'strength_in_numbers',
        ],
    },
    {
        'name': 'All buffs', # XXX For now; delete when support for tabs arrives
        'order': [
            'might',
            'fury',
            'quickness',
            'alacrity',
            'protection',
            'retaliation',
            'regen',
            'spotter',
            'glyph_of_empowerment',
            'gotl',
            'spirit_of_frost',
            'sun_spirit',
            'stone_spirit',
            'storm_spirit',
            'empower_allies',
            'banner_strength',
            'banner_discipline',
            'banner_tactics',
            'banner_defence',
            'assassins_presence',
            'naturalistic_resonance',
            'pinpoint_distribution',
            'soothing_mist',
            'vampiric_presence',
            'strength_in_numbers',
        ],
    },
]
