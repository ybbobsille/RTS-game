import engine from "../engine.js"
dependancies = engine.Register("Bots", ["Main"])
engine.Vcheck("1.0.0")

const bots = []
var bot_placements = null
const bot_config = {
    /* 
    deviation:
        currently calculated by taking a random -1 to 1 value as x, and the max deviation as y: x⁴ * y
    */

    // related to the pre-game phase where you select your location
    start: {
        // the ideal minimum distance to keep other territories
        ideal_distance: 15,
        // how fast the willingness to stay decays after ideal distance (higher is more tolerent to close territories)
        distance_falloff: {   
            player: 0.7,
            bot: 0.9
        },
        // starting size of the bots territory
        starting_size:3.5,
        // how fast it will grow loyal to its position and fight for it
        position_loyalty: 0.2,
        // how fast it will gorw stressful of its current position, and more willing to give it up
        position_stress: 0.15,
        // how fast it will lose stress when there is no-one close
        stress_decay: 0.1,
        // when the bot will start feeling stress when the willingness is below this point
        stress_point: 7.5,
        // the initial value for willingness
        base_willingness: 10
    },
    // related to the main phase of the game
    General: {
        // how much the bot will respect players/bots
        // this will effect how much the bots will alliance/attack players/bots
        respect: {
            player: 0.8,
            bot: 0.6
        },
        // this is how much deviation to have in the respect (chosen at game start for each bot)
        // the respect for bots and players will be limited between 1 and 0
        respect_deviation: {
            player: 0.3,
            bot: 0.3
        },
        // how patience the bot will be, so lower means more urgency to: gain land, spread out, etc. (limited to 0-1)
        patience: 0.5,
        patience_deviation: 0.4
    }
}

class Bot_Handler {
    constructor(name) {
        this.name = name
        this.territory = engine.Register_Territory(name)
        this.selected_pixels = []
        this.target_location = null
        this.current_location = null
        this.position_loyalty = 0
        this.position_stress = 0
    }

    async Tick_Starting_Location() {
        const Pick_New_Target_Location = () => {
            var map_size = engine.game_settings.map.size
            var start_size = bot_config.start.starting_size
            this.target_location = null
            while (!this.target_location
                || engine.game_settings.map.get(this.target_location[0], this.target_location[1])?.owner == "void"
            ) {
                this.target_location = [
                    engine.Clamp(Math.round(Math.random() * map_size[0]), start_size, map_size[0] - start_size),
                    engine.Clamp(Math.round(Math.random() * map_size[1]), start_size, map_size[1] - start_size)
                ]
            }
        }
        const Selection_Location = (x, y) => {
            this.position_stress = 0
            this.position_loyalty = 0
            this.selected_pixels.forEach(pixel => {
                if (pixel.owner == this.territory) {
                    pixel.filter = null
                    pixel.owner = "wild"
                }
            });
            this.current_location = [x, y]
            this.selected_pixels = engine.game_settings.map.get_Circle(x, y, bot_config.start.starting_size)
            //console.log(this.selected_pixels)
            this.selected_pixels.forEach(pixel => {
                if (pixel.owner != "void") {
                    pixel.filter = engine.territories[this.territory].color
                    pixel.owner = this.territory
                }
            });
        }

        if (!this.target_location) Pick_New_Target_Location()

        if (this.current_location) {
            var willingness = bot_config.start.base_willingness
            //TODO: include player pos's in the relitvent placements
            const relivent_placments = bot_placements.filter(p => engine.Distance(p[0], p[1], this.current_location[0], this.current_location[1]) < bot_config.start.ideal_distance)
            
            relivent_placments.forEach(point => {
                const distance = engine.Distance(this.current_location[0], this.current_location[1], point[0], point[1])
                // 0 - 1
                const score = (Math.max(-distance + bot_config.start.ideal_distance, 0) / bot_config.start.ideal_distance)

                willingness -= score * (point[2] == "bot" ? bot_config.start.distance_falloff.bot : bot_config.start.distance_falloff.player)
            })

            if (willingness != 7.5) {
                this.position_stress += bot_config.start.position_stress
            }
            else {
                this.position_stress -= bot_config.start.stress_decay
            }

            if ((willingness + this.position_loyalty - this.position_stress) < (Math.random() * bot_config.start.base_willingness)) {
                Pick_New_Target_Location()
                Selection_Location(this.target_location[0], this.target_location[1])
            }
            else {
                this.position_loyalty +=  bot_config.start.position_loyalty
            }
        }
        else {
            Selection_Location(this.target_location[0], this.target_location[1])
        }

        // every 5th tick try to reclaim land within the circle
        if (engine.Tick_Index() % 5 == 0) {
            this.selected_pixels.forEach(pixel => {
                if (pixel.owner == "wild") {
                    pixel.owner = this.territory
                    pixel.filter = engine.territories[this.territory].color
                }
            })
        }
    }

    async Tick_Game() {
        if (this.current_location) {
            //clean up starting data and init game data
            this.land = new engine.Territory_Manager(this.selected_pixels, this.territory)

            delete this.selected_pixels
            delete this.target_location
            delete this.current_location
            delete this.position_loyalty
            delete this.position_stress

            this.respect = {
                player: bot_config.General.respect.player + calculate_deviation(bot_config.General.respect_deviation.player),
                bot: bot_config.General.respect.bot + calculate_deviation(bot_config.General.respect_deviation.bot)
            }
            this.patience = bot_config.General.patience + calculate_deviation(bot_config.General.patience_deviation)
        }
    }
}

function calculate_deviation(deviation) {
    var y = deviation
    var x = Math.random() * 2 - 1 // random -1 to 1 value
    return Math.pow(x, 4) * y // devalues low numbers to make high deviation uncommon
}

export async function tick() {
    if (engine.Is_Started()) {
        for (var bot of bots) {
            await bot.Tick_Game()
        }
    }
    else {
        bot_placements = bots.map(bot => [...(bot.current_location ? bot.current_location : [null]), "bot"]).filter(p => p != null)
        for (var bot of bots) {
            await bot.Tick_Starting_Location()
        }
    }
}

export function init() {
    if (!engine.game_settings.bots || engine.game_settings.bot_count == 0) return

    for (var i=0; i<engine.game_settings.bot_count; i++) {
        bots.push(new Bot_Handler(`Bot_${i}`))
    }
}