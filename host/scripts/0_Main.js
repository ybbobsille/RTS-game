import engine from "../engine.js"
import bmp from "bmp-js"
import fs from "fs"
engine.Register("Main", "1.0.0")
engine.Vcheck("1.0.0")

class Map_Pixel extends engine.color {
    constructor(x, y, r, g, b, a, map) {
        super(r, g, b, a)
        this.x = x
        this.y = y
        this.map = map

        this.owner = r + g + b + a == 0 ? "void" : "wild"
    }

    get pos() {
        return [this.x, this.y]
    }

    get up() {
        return this.map.get(this.x, this.y + 1)
    }

    get down() {
        return this.map.get(this.x, this.y - 1)
    }

    get right() {
        return this.map.get(this.x + 1, this.y)
    }

    get left() {
        return this.map.get(this.x - 1, this.y)
    }

    get neighbors() {
        return [
            this.up,
            this.right,
            this.down,
            this.left
        ]
    }
}

class Map_Handler {
    raw = null;

    constructor(name) {
        this.raw = this._read_bmp(`./maps/${name}.bmp`)
        this.height = this.raw[0].length
        this.width = this.raw.length
    }

    get size() {
        return [this.width, this.height]
    }

    get_Square(x1, y1, x2, y2) {
        const pixels = []
        for (var x = x1; x <= x2; x++) {
            for (var y = y1; y <= y2; y++) {
                //console.log(x1,y1,x2,y2,x,y)
                pixels.push(this.get(x, y))
            }
        }
        return pixels
    }

    get_Circle(x, y, radius) {
        const x1 = x - radius
        const x2 = x + radius
        const y1 = y - radius
        const y2 = y + radius

        const candidates = this.get_Square(x1, y1, x2, y2)
        const result = candidates.map(pixel => engine.Distance(x, y, pixel.x, pixel.y) > radius ? null : pixel)
        return result.filter(pixel => pixel != null)
    }

    get(x, y) {
        if (x >= this.width) {
            x %= this.width
        }
        while (x < 0) {
            x += this.width
        }
        if (y >= this.height) {
            y %= this.height
        }
        while (y < 0) {
            y += this.height
        }

        //console.log(x,y,this.raw[x][y].x, this.raw[x][y].y)
        return this.raw[Math.round(x)][Math.round(y)]
    }

    _read_bmp(file) {
        const bmpBuffer = fs.readFileSync(file);
        const bmpData = bmp.decode(bmpBuffer);

        const { data, width, height } = bmpData;

        const pixels = [];
        let idx = 0;

        for (let x = 0; x < width; x++) {
            const row = [];
            for (let y = 0; y < width; y++) {
                const r = data[idx++];
                const g = data[idx++];
                const b = data[idx++];
                const a = data[idx++];

                row.push(new Map_Pixel(x, y, r, g, b, a, this));
            }
            pixels.push(row);
        }
        return pixels
    }

    _dump_bmp() {
        const height = this.raw.length;
        const width = this.raw[0].length;

        const data = Buffer.alloc(width * height * 4); // RGBA output
        let idx = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixel = this.raw[y][x];
                const [r, g, b, a] = pixel.rgba
                
                data[idx++] = r;
                data[idx++] = g;
                data[idx++] = b;
                data[idx++] = a;
            }
        }

        const rawData = {
            data,
            width,
            height
        };

        const bmpBuffer = bmp.encode(rawData);
        return bmpBuffer
    }
}

class Territory_Manager {
    land;
    territory;
    color;

    constructor (land, territory, troops) {
        land = land.filter(pixel => pixel.owner != "void")
        this.land = land
        this.territory = territory
        this.troops = troops
        this.color = engine.public.territories[territory].color
        this.attacking_progress = {}
        
        land.forEach(pixel => {
            if (pixel.owner != "void") {
                pixel.filter = this.color
                pixel.owner = this.territory
            }
        })

        engine.public.territory_objects[territory] = this
    }

    get borders() {
        const borders = [];
        for (var pixel of this.land) {
            for (var neighbor of pixel.neighbors) {
                if (neighbor.owner != this.territory) {
                    borders.push(neighbor)
                }
            }
        }
        return borders
    }

    Claim_Land(x, y) {
        const pixel = engine.public.map.get(x,y)
        if (pixel.owner != "void") {
            pixel.filter = this.color
            pixel.owner = this.territory
            this.land.push(pixel)
            return true
        }
        return false
    }

    bordering(territory) {
        for (var pixel of this.land) {
            for (var neighbor of pixel.neighbors) {
                if (neighbor.owner == territory) {
                    return true
                }
            }
        }

        return false
    }

    attack(territory, troop_percent) {
        const troop_count = Math.floor(this.troops * (troop_percent / 100))
        this.troops -= troop_count
        if (this.attacking_progress[territory]) {
            this.attacking_progress[territory] += troop_count
        }
        else {
            this.attacking_progress[territory] = troop_count
        }
    }

    attacking(territory) {
        return this.attacking_progress[territory] ? true : false
    }

    _tick() {
        const max_troops = this.land.length * engine.public.settings.territory_value
        const troop_percent = this.troops / max_troops
        const bordering = this.borders
        Object.entries(this.attacking_progress).forEach(([territory, troops]) => {
            console.log(this.territory, ">", territory, troops)

            if (!this.bordering(territory)) {
                this.troops = Math.min(max_troops, this.troops + troops)
                troops = 0
            }
            if (troops <= 0) {
                delete this.attacking_progress[territory]
                return
            }
            bordering.forEach(pixel => {
                //TODO: update to make troop count effect it
                if (pixel.owner == territory && troops > 0) {
                    troops--
                    if (engine.Chance(troops / (max_troops / 6) * 100)) {
                        this.Claim_Land(pixel.x, pixel.y)
                    }
                }
            })
            
            this.attacking_progress[territory] = troops
        })

        const [a,b,c,x] = [1,2.5,1,troop_percent*5]
        this.troops += Math.pow(a*2.718, -(Math.pow(x-b, 2) / 2 * Math.pow(c, 2)))
            * (max_troops * engine.public.settings.troop_gain_rate)

        this.troops = Math.min(max_troops, this.troops)
    }
}

function Generate_Territory_Color() {
    const used = Object.values(engine.public.territories).map(t => t.color.hsla[0]);

    if (used.length === 0) {
        return engine.color.From_HSLA(0, 45, 70, 50);
    }

    const sorted = used.slice().sort((a, b) => a - b);

    const points = [...sorted, sorted[0] + 360];

    let bestGap = -1;
    let bestHue = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const gap = b - a;

        if (gap > bestGap) {
            bestGap = gap;
            bestHue = a + gap / 2;
        }
    }

    bestHue = bestHue % 360;

    return engine.color.From_HSLA(bestHue, 45, 70, 50);
}

function Register_Territory(name) {
    // Generates a uniqe id and color for each territory
    var id = null
    const Chars = "qwertyuiopasdfghjklzxcvbnmm"
    while (id == null) {
        id = ""
        for (var i = 0; i < 10; i++) id += Chars.charAt(Math.round(Math.random() * Chars.length))
        if (engine.public.territories[id]) {
            id = null
        }
    }
    engine.public.territories[id] = {
        name:name,
        color: Generate_Territory_Color()
    }
    return id
}

function _render_to_file(fp) {
    const data = engine.public.map._dump_bmp()
    fs.writeFileSync(fp, data.data)
}

export function tick() {
    if (global.tick_duration > (1000 / engine.tick_rate) * 0.8) {
        console.warn("Warning! tick duration is abnormaly high!")
    }

    Object.values(engine.public.territory_objects).forEach(TM => TM._tick())

    _render_to_file("./out.bmp")
}

export function init() {
    engine.public.map = new Map_Handler(engine.public.settings.map)
}

export function ui_script() {

}

engine.public = {
    settings: {
        map: "basic",
        bots:true,
        bot_count:10,
        troop_gain_rate: 0.05,
        territory_value: 4 // the number of troops to alow per-space.
    },
    territories:{},
    territory_objects:{},

    Register_Territory,

    Territory_Manager: Territory_Manager
}