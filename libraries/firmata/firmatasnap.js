import { Firmata, WebSerialTransport } from "./index.js";

// FirmataController //////////////////////////////////////////////////////

function FirmataController (stage) {
    this.init(stage);
};

FirmataController.prototype.init = function (stage) {
    this.stage = stage;
    this.port = null;
    this.transport = null;
    this.board = null;
    this.analogReadings = [];
    this.digitalReadings = [];
};

FirmataController.prototype.connect = function () {
    navigator.serial.requestPort().then(port => {
        if (this.board) {
            this.disconnect(true); // quietly
        }
        var dialog = 
            new DialogBoxMorph().inform(
                'Connection',
                'Trying to connect...',
                this.stage.world()
            );
        this.port = port;
        port.open({ baudRate: 57600 }).then(() => {
            this.analogReadings = [];
            this.digitalReadings = [];
            this.transport = new WebSerialTransport(port);
            this.board = new Firmata(this.transport);
            this.board.on('ready', () => {
                if (dialog) { dialog.destroy(); }
                new DialogBoxMorph().inform(
                    'Connection',
                    'Connection successful.\nHappy prototyping!',
                    this.stage.world()
                );
            });
        });
    });
};

FirmataController.prototype.disconnect = function (quietly) {
    if (this.board) {
        this.board.serialClose();
        this.board = null;
    }
    if (this.port) {
        this.port.forget();
        this.port = null;
    }
    this.analogReadings = [];
    this.digitalReadings = [];
    if (!quietly) {
        new DialogBoxMorph().inform(
            'Connection',
            'Connection closed.',
            this.stage.world()
        );
    }
};

FirmataController.prototype.digitalWrite = function (pin, value) {
    var board = this.board;
    if (board && board.isReady) {
        if (board.pins[pin].mode != board.MODES.OUTPUT) {
            board.pinMode(pin, board.MODES.OUTPUT);
        }
        board.digitalWrite(pin, value ? 1 : 0);
    }
};

FirmataController.prototype.analogWrite = function (pin, value) {
    var board = this.board;
    if (board && board.isReady) {
        if (board.pins[pin].mode != board.MODES.PWM) {
            board.pinMode(pin, board.MODES.PWM);
        }
        board.analogWrite(pin, value);
    }
};

FirmataController.prototype.servoWrite = function (pin, value) {
    // TODO parse the value and set up servo defaults
    var board = this.board;
    if (board && board.isReady) {
        if (board.pins[pin].mode != board.MODES.SERVO) {
            board.pinMode(pin, board.MODES.SERVO);
        }
        this.board.servoWrite(pin, value);
    }
};

FirmataController.prototype.analogRead = function (pin, value) {
    var board = this.board;
    if (board && board.isReady) {
        if (board.pins[pin].mode != board.MODES.ANALOG) {
            board.pinMode(pin, board.MODES.ANALOG);
        }
        if (this.analogReadings[pin] == undefined) {
            this.analogReadings[pin] = 'waiting'
            board.analogRead(
                pin,
                v => { this.analogReadings[pin] = v }
            );
        }
    }
    return this.analogReadings[pin];
};

FirmataController.prototype.digitalRead = function (pin, value) {
    var board = this.board;
    if (board && board.isReady) {
        if (board.pins[pin].mode != board.MODES.INPUT) {
            board.pinMode(pin, board.MODES.INPUT);
        }
        if (this.digitalReadings[pin] == undefined) {
            this.digitalReadings[pin] = 'waiting';
            board.digitalRead(
                pin,
                v => { this.digitalReadings[pin] = v == 1 }
            );
        }
    }
    return this.digitalReadings[pin];
};

FirmataController.prototype.pinsThatSupport = function (mode) {
    var pins = [],
        board = this.board;
    if (board && board.isReady) {
        board.pins.forEach(
            (pin, index) => {
                if (pin.supportedModes.includes(board.MODES[mode])) {
                    pins.push(index);
                }
            }
        );
    }
    return pins;
};

FirmataController.prototype.formatMenu = function (array) {
    return array.reduce((a,v) => ({ ...a, [v]: v}), {});
};

// SnapExtensions API ////////////////////////////////////////////////////

// Buttons

SnapExtensions.buttons.palette.push({
    category: 'Firmata',
    label: 'Connect',
    hideable: false,
    action: function () {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) {
            stage.firmataController = new FirmataController(stage);
        }
        stage.firmataController.connect();
    }
});

SnapExtensions.buttons.palette.push({
    category: 'Firmata',
    label: 'Disconnect',
    hideable: false,
    action: function () {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) {
            stage.firmataController = new FirmataController(stage);
        }
        stage.firmataController.disconnect();
    }
});

// Initialize the extension

(function() {
    var ide = world.children[0],
        stage = ide.stage;

    // Redo palette so the button actually shows up
    world.children[0].flushBlocksCache();
    world.children[0].refreshPalette();

    // Init controller
    if (!stage.firmataController) {
        stage.firmataController = new FirmataController(stage);
    }
})();

// Extension menus

SnapExtensions.menus.set(
    'frm_digitalOutputs',
    function () {
        var target = this.parentThatIsA(BlockMorph).scriptTarget(),
            controller = target.parentThatIsA(StageMorph).firmataController,
            pins = controller.pinsThatSupport('OUTPUT');
        return controller.formatMenu(pins);
    }
);

SnapExtensions.menus.set(
    'frm_analogOutputs',
    function () {
        var target = this.parentThatIsA(BlockMorph).scriptTarget(),
            controller = target.parentThatIsA(StageMorph).firmataController,
            pins = controller.pinsThatSupport('PWM');
        return controller.formatMenu(pins);
    }
);

SnapExtensions.menus.set(
    'frm_servoOutputs',
    function () {
        var target = this.parentThatIsA(BlockMorph).scriptTarget(),
            controller = target.parentThatIsA(StageMorph).firmataController,
            pins = controller.pinsThatSupport('SERVO');
        return controller.formatMenu(pins);
    }
);

SnapExtensions.menus.set(
    'frm_analogInputs',
    function () {
        var target = this.parentThatIsA(BlockMorph).scriptTarget(),
            controller = target.parentThatIsA(StageMorph).firmataController,
            pins = [];
        if (controller.board && controller.board.isReady) {
            controller.board.pins.forEach(
                (pin, index) => {
                    if (pin.analogChannel < 127) {
                        pins.push(pin.analogChannel);
                    }
                }
            )
        }
        return controller.formatMenu(pins);
    }
);

SnapExtensions.menus.set(
    'frm_digitalInputs',
    function () {
        var target = this.parentThatIsA(BlockMorph).scriptTarget(),
            controller = target.parentThatIsA(StageMorph).firmataController,
            pins = controller.pinsThatSupport('INPUT');
        return controller.formatMenu(pins);
    }
);

// Extension blocks

SnapExtensions.primitives.set(
    'frm_digitalWrite(pin, value)',
    function (pin, value) {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) { return; }
        stage.firmataController.digitalWrite(pin, value);
    }
);

SnapExtensions.primitives.set(
    'frm_analogWrite(pin, value)',
    function (pin, value) {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) { return; }
        stage.firmataController.analogWrite(pin, value);
    }
);

SnapExtensions.primitives.set(
    'frm_servoWrite(pin, value)',
    function (pin, value) {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) { return; }
        stage.firmataController.servoWrite(pin, value);
    }
);

SnapExtensions.primitives.set(
    'frm_digitalRead(pin)',
    function (pin) {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) { return; }
        return stage.firmataController.digitalRead(pin);
    }
);

SnapExtensions.primitives.set(
    'frm_analogRead(pin)',
    function (pin) {
        var stage = this.parentThatIsA(StageMorph);
        if (!stage.firmataController) { return; }
        return stage.firmataController.analogRead(pin);
    }
);
