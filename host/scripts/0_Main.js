import engine from "../engine.js"
import bmp from "bmp-js"
import fs from "fs"
engine.Register("Main")
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
                
                data[idx++] = pixel.r;
                data[idx++] = pixel.g;
                data[idx++] = pixel.b;
                data[idx++] = pixel.a;
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

export function _render_to_file(fp) {
    const data = engine.game_settings.map._dump_bmp()
    fs.writeFileSync(fp, data.data)
}

export function tick() {
    if (global.tick_duration > (1000 / engine.tick_rate) * 0.8) {
        console.warn("Warning! tick duration is abnormaly high!")
    }
}

export function init() {
    engine.game_settings.map = new Map_Handler(engine.game_settings.map)
}