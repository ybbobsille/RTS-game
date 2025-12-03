class Color {
    constructor(r, g, b, a) {
        this._r = r
        this._g = g
        this._b = b
        this._a = a
        this.filter = null
    }

    get r() {
        return this._Apply_Filter(this._r, this.filter?.r)
    }

    get g() {
        return this._Apply_Filter(this._g, this.filter?.g)
    }

    get b() {
        return this._Apply_Filter(this._b, this.filter?.b)
    }

    get a() {
        return this._Apply_Filter(this._a, this.filters?.a)
    }
    
    _Apply_Filter(value, filter) {
        return value + (filter || 0)
    }

    static From_HSLA(h, s, l, a) {
        s = s / 100
        l = l / 100
        a = a / 100

        const C = (1 - Math.abs(2 * l - 1)) * s;
        const Hp = h / 60;
        const X = C * (1 - Math.abs((Hp % 2) - 1));

        let r1, g1, b1;
        if (0 <= Hp && Hp < 1) [r1, g1, b1] = [C, X, 0];
        else if (1 <= Hp && Hp < 2) [r1, g1, b1] = [X, C, 0];
        else if (2 <= Hp && Hp < 3) [r1, g1, b1] = [0, C, X];
        else if (3 <= Hp && Hp < 4) [r1, g1, b1] = [0, X, C];
        else if (4 <= Hp && Hp < 5) [r1, g1, b1] = [X, 0, C];
        else[r1, g1, b1] = [C, 0, X];

        const m = l - C / 2;

        return new Color(
            Math.round((r1 + m) * 255),
            Math.round((g1 + m) * 255),
            Math.round((b1 + m) * 255),
            a * 100
        )
    }

    get hsla() {
        const R = this.r / 255;
        const G = this.g / 255;
        const B = this.b / 255;

        const max = Math.max(R, G, B);
        const min = Math.min(R, G, B);
        const delta = max - min;

        let h, s, l;
        l = (max + min) / 2;

        if (delta === 0) {
            h = 0;
            s = 0;
        } else {
            s = delta / (1 - Math.abs(2 * l - 1));

            switch (max) {
                case R:
                    h = 60 * (((G - B) / delta) % 6);
                    break;
                case G:
                    h = 60 * ((B - R) / delta + 2);
                    break;
                case B:
                    h = 60 * ((R - G) / delta + 4);
                    break;
            }
        }

        if (h < 0) h += 360;

        return [ h, s*100, l*100, this.a ];
    }

    get rgba() {
        const bottom = this
        const top = this.filter
        if (!top) return [this.r, this.g, this.b, this.a]
        // bottom = {r,g,b,a}, top = {r,g,b,a}
        const aA = bottom.a / 255;
        const aB = top.a / 255;

        const outA = aB + aA * (1 - aB);

        if (outA === 0) return { r:0, g:0, b:0, a:0 };

        const r = (top.r * aB + bottom.r * aA * (1 - aB)) / outA;
        const g = (top.g * aB + bottom.g * aA * (1 - aB)) / outA;
        const b = (top.b * aB + bottom.b * aA * (1 - aB)) / outA;

        return [
            Math.round(r),
            Math.round(g),
            Math.round(b),
            Math.round(outA * 255)
        ];

    }
}

class Territory_Manager {
    constructor (land, territory) {
        this.land = land
        this.territory = territory
        this.color = engine.territories[territory].color
    }
}

function Generate_Territory_Color() {
    const used = Object.values(engine.territories).map(t => t.color.hsla[0]);

    if (used.length === 0) {
        return Color.From_HSLA(0, 45, 70, 50);
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

    return Color.From_HSLA(bestHue, 45, 70, 50);
}

const engine = {
    version: {
        name: "1.0.0",
        major: 1,
        minor: 0,
        patch: 0
    },
    users: [],
    package_name: "",
    user_connections: [],
    game_settings: {
        map: null,
        bots: false,
        bot_count: 10
    },
    territories: {},
    tick_rate: 0,

    Register_Territory: (name) => {
        // Generates a uniqe id and color for each territory
        var id = null
        const Chars = "qwertyuiopasdfghjklzxcvbnmm"
        while (id == null) {
            id = ""
            for (var i = 0; i < 10; i++) id += Chars.charAt(Math.round(Math.random() * Chars.length))
            if (engine.territories[id]) {
                id = null
            }
        }

        engine.territories[id] = {
            name:name,
            color: Generate_Territory_Color()
        }
        return id
    },
    Vcheck: (expected, terminal = true) => {
        // checks if the provided version is the same as the engine version.
        // - terminal: whether to through an error if its incorrect.
        if (expected != engine.version.name) {
            if (terminal) throw `Version mismatch for module '${engine.package_name}'`
            else return false
        }

        return true
    },
    Is_Started() {
        // returns true if the game has started.
        return global.game_started
    },
    Clamp(value, min, max) {
        // clamps value between min and max
        return Math.min(max, Math.max(min, value))
    },
    Distance(x1, y1, x2, y2) {
        // returns the distance from (x1, y1) to (x2, y2)
        return Math.sqrt((x1-x2)*(x1-x2) + (y1-y2)*(y1-y2))
    },
    Tick_Index() {
        // returns the current tick index (number of ticks since start)
        return global.tick_index
    },

    color: Color,
    Territory_Manager: Territory_Manager
}

engine.users = global.users
engine.user_connections = global.users_connections
engine.game_settings = global.Game_Settings
engine.tick_rate = global.Game_Settings.tick_rate

export default engine