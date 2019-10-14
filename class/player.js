const DEFAULT_HOOK_SETTINGS = {order: -1001, filter: {fake: null}};

class player{
    constructor(dispatch, mods) {
        // Mount
        this.onMount = false;
        // Alive
        this.alive = true;
        // Inventory
        this.inven = {weapon: false, effects: []};
        let inventoryBuffer = [];
        // Location
        this.loc = {x: 0, y: 0, z: 0, w: 0, updated: 0};
        this.pos = {x: 0, y: 0, z: 0, w: 0, updated: 0};
        // Is the player moving?
        this.moving = false;
        // zone information
        this.zone = -1;
        // List over players in party
        this.playersInParty = [];
        // Pegasus status
        this.onPegasus = false;
        // Channel
        this.channel = 0;

        // Functions
        this.isMe = (arg) => {
            return arg == this.gameId;
        }

        // Login
        this.sLogin = (e) => {
            this.onPegasus = false;
            this.gameId = e.gameId;
            this.templateId = e.templateId;
            this.serverId = e.serverId;
            this.playerId = e.playerId;

            this.race = Math.floor((e.templateId - 10101) / 100);
            this.job = (e.templateId - 10101) % 100;
            this.name = e.name;
            this.level = e.level;
        }
        dispatch.hook(...mods.packet.get_all("S_LOGIN"), DEFAULT_HOOK_SETTINGS, this.sLogin);

        // Level up
        try{
            dispatch.hook(...mods.packet.get_all("S_USER_LEVELUP"), e=> {
                if(this.isMe(e.gameId)) this.level = e.level;
            });
        }catch(e) {}

        // Attack Speed & Stamina
        this.sPlayerStatUpdate = (e) => {
            this.previous_sPlayerStatUpdate = e;
            this.stamina = e.stamina;
            this.health = e.hp;
            this.maxHealth = e.maxHp;
            this.mana = e.mp;
            this.maxMana = e.maxMp;
            // Attack speed
            this.attackSpeed = e.attackSpeed;
            this.attackSpeedBonus = e.attackSpeedBonus;
            this.aspdDivider = (this.job >= 8 ? 100 : e.attackSpeed);
            this.aspd = (e.attackSpeed + e.attackSpeedBonus) / this.aspdDivider;
            // movement speed
            this.msWalk = e.walkSpeed + e.walkSpeedBonus;
            this.msWalkBase = e.walkSpeed;
            this.msWalkBonus = e.walkSpeedBonus;

            this.msRun = e.runSpeed + e.runSpeedBonus;
            this.msRunBase = e.runSpeed
            this.msRunBonus = e.runSpeedBonus;

            // Sorc edge shit
            this.fireEdge = e.fireEdge;
            this.iceEdge = e.iceEdge;
            this.lightningEdge = e.lightningEdge;
        }
        dispatch.hook(...mods.packet.get_all("S_PLAYER_STAT_UPDATE"), DEFAULT_HOOK_SETTINGS, this.sPlayerStatUpdate);

        // Channel/zone information
        if(!dispatch.isClassic) {
            dispatch.hook(...mods.packet.get_all("S_CURRENT_CHANNEL"), e=> {
                this.channel = e.channel - 1;
                this.zone = e.zone;
            });
        }

        // Stamina
        this.sPlayerChangeStamina = (e) => {
            this.stamina = e.current;
        }
        dispatch.hook(...mods.packet.get_all("S_PLAYER_CHANGE_STAMINA"), DEFAULT_HOOK_SETTINGS, this.sPlayerChangeStamina);

        // health
        this.s_creature_change_hp = e => {
            if(!this.isMe(e.target)) return;
            this.health = e.curHp;
            this.maxHealth = e.maxHp;
        }
        dispatch.hook(...mods.packet.get_all("S_CREATURE_CHANGE_HP"), DEFAULT_HOOK_SETTINGS, this.s_creature_change_hp);

        // mana
        this.s_player_change_mp = e => {
            if(!this.isMe(e.target)) return;
            this.mana = e.currentMp;
            this.maxMana = e.maxMp;
        }
        dispatch.hook(...mods.packet.get_all("S_PLAYER_CHANGE_MP"), DEFAULT_HOOK_SETTINGS, this.s_player_change_mp);

        // Mount
        this.sLoadTopo = (e) => {
            this.onMount = false;
            this.zone = e.zone;
        }
        dispatch.hook(...mods.packet.get_all("S_LOAD_TOPO"), DEFAULT_HOOK_SETTINGS, this.sLoadTopo);

        this.sMount = (onMount, e) => {
            if(this.isMe(e.gameId)) this.onMount = onMount;
        }
        dispatch.hook(...mods.packet.get_all("S_MOUNT_VEHICLE"), DEFAULT_HOOK_SETTINGS, this.sMount.bind(null, true));
        dispatch.hook(...mods.packet.get_all("S_UNMOUNT_VEHICLE"), DEFAULT_HOOK_SETTINGS, this.sMount.bind(null, false));

        // Party
        this.sPartyMemberList = (e) => {
            this.playersInParty = [];
			
			for(let member of e.members){
				// If the member isn't me, we can add him/her/helicopter. Let's not assume genders here
				if(!this.isMe(member.gameId)) this.playersInParty.push(member.gameId);
			}
        }
        dispatch.hook(...mods.packet.get_all("S_PARTY_MEMBER_LIST"), this.sPartyMemberList);

        this.sLeaveParty = (e) => {
            this.playersInParty = [];
        }
        dispatch.hook('S_LEAVE_PARTY', 'raw', this.sLeaveParty);

        // Alive
        this.sSpawnMe = (e) => {
            this.alive = true;
        }
        dispatch.hook('S_SPAWN_ME', 'raw', DEFAULT_HOOK_SETTINGS, this.sSpawnMe);

        this.sCreatureLife = (e) => {
            if(this.isMe(e.gameId)) {
                this.alive = e.alive;
                Object.assign(this.loc, e.loc);
            }
        }
        dispatch.hook(...mods.packet.get_all("S_CREATURE_LIFE"), DEFAULT_HOOK_SETTINGS, this.sCreatureLife);

        // Inventory
        // this is ugly but guess what, if you're reading my code idk what you expect -- I know you're reading this Caali and I know you hate it
        if(dispatch.majorPatchVersion >= 85) {
            this.sInven = (e) => {
                if(!this.isMe(e.gameId)) return;

                inventoryBuffer = e.first ? e.items : inventoryBuffer.concat(e.items);
                this.gold = e.money;
    
                if(!e.more) {
                    switch(e.container) {
                        // inven
                        case 0: {
                            this.inven.items = {};

                            for(const item of inventoryBuffer) {
                                if(!this.inven.items[item.id]) this.inven.items[item.id] = [];
                                this.inven.items[item.id].push(Object.assign(item, {
                                    itemId: item.id
                                }));
                            }
                            break;
                        }

                        // equip
                        case 14: {
                            this.inven.weapon = false;
                            this.inven.effects = [];
                            
                            for(const item of inventoryBuffer) {
                                switch(item.slot) {
                                    case 1: {
                                        this.inven.weapon = true;
                                        break;
                                    }
                                    case 3: {
                                        let activeSet = item.passivitySets[item.passivitySet];
                                        if(!activeSet) activeSet = item.passivitySets[0];
                                        if(!activeSet) break;

                                        this.inven.effects = activeSet.passivities;
                                        break;
                                    }
                                }
                            }
                            break;
                        }
                    }
    
                    inventoryBuffer = [];
                }
            };
            dispatch.hook(...mods.packet.get_all("S_ITEMLIST"), DEFAULT_HOOK_SETTINGS, this.sInven);
        }else {
            this.sInven = (e) => {
                if(!this.isMe(e.gameId)) return;

                inventoryBuffer = e.first ? e.items : inventoryBuffer.concat(e.items);
                this.gold = e.gold;
    
                if(!e.more) {
                    this.inven.weapon = false;
                    this.inven.effects = [];
                    this.inven.items = {};
    
                    for(let item of inventoryBuffer) {
                        if(!this.inven.items[item.id]) this.inven.items[item.id] = [];
                        this.inven.items[item.id].push(Object.assign(item, {
                            itemId: item.id
                        }));
                        
                        switch(item.slot) {
                            case 1:
                                this.inven.weapon = true;
                                break;
                            case 3:
                                // We put a try statement here because fuck everything and everyone. :)
                                let activeSet = [];
    
                                if(dispatch.isClassic) activeSet = item.passivities;
                                else {
                                    activeSet = item.passivitySets[item.passivitySet];
                                    if(!activeSet)
                                        activeSet = item.passivitySets[0];
                                }
    
                                try {
                                    for (const effect of activeSet.passivities) {
                                        this.inven.effects.push(Number(effect.id));
                                    }
                                }catch(e) {this.inven.effects = [];}
    
                                break;
                        }
                    }
    
                    inventoryBuffer = [];
                }
            };
            dispatch.hook('S_INVEN', dispatch.majorPatchVersion < 80 ? 17 : 18, DEFAULT_HOOK_SETTINGS, this.sInven);
        }

        // Pegasus
        dispatch.hook(...mods.packet.get_all("S_USER_STATUS"), e=> {
            if(this.isMe(e.gameId)) this.onPegasus = (e.status === 3);
        });

        // Player moving
        dispatch.hook(...mods.packet.get_all("C_PLAYER_LOCATION"), DEFAULT_HOOK_SETTINGS, e=> {
            this.moving = e.type !== 7;
        });

        // Player location
        this.handleMovement = (serverPacket, e) => {
            // e.type !== 7 &&  (why was this here? idk, let's see if shit fucks up)
            if(serverPacket ? e.gameId == this.gameId : true) {
                let loc = e.loc;
                loc.w = (e.w === undefined ? this.loc.w : e.w);
                loc.updated = Date.now();

                this.loc = loc;
                this.pos = loc;
            }
        }
        
        dispatch.hook(...mods.packet.get_all("S_ACTION_STAGE"), {filter: {fake: null}, order: 10000}, this.handleMovement.bind(null, true));
        dispatch.hook(...mods.packet.get_all("S_ACTION_END"), {filter: {fake: null}, order: 10000}, this.handleMovement.bind(null, true));
        dispatch.hook(...mods.packet.get_all("C_PLAYER_LOCATION"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        // Notify location in action
        dispatch.hook(...mods.packet.get_all("C_NOTIFY_LOCATION_IN_ACTION"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        if(!dispatch.isClassic)
            dispatch.hook(...mods.packet.get_all("C_NOTIFY_LOCATION_IN_DASH"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        // skills
        dispatch.hook(...mods.packet.get_all("C_START_SKILL"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        dispatch.hook(...mods.packet.get_all("C_START_TARGETED_SKILL"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        dispatch.hook(...mods.packet.get_all("C_START_COMBO_INSTANT_SKILL"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        dispatch.hook(...mods.packet.get_all("C_START_INSTANCE_SKILL"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        if(!dispatch.isClassic)
            dispatch.hook(...mods.packet.get_all("C_START_INSTANCE_SKILL_EX"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
        dispatch.hook(...mods.packet.get_all("C_PRESS_SKILL"), {filter: {fake: null}, order: -10000}, this.handleMovement.bind(null, false));
    }
}

module.exports = player;