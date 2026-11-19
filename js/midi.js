// Controladores MIDI (Akai MPD/MPK/APC, Pioneer DDJ, etc.) via Web MIDI.
// Nota 36 (C1) = pad 1, como nos controladores de pads da Akai.

export class Midi {
  constructor(handlers) {
    this.h = handlers;
    this.access = null;
    this.inputs = [];
    this.learn = null;
  }

  get supported() { return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess; }

  async enable() {
    if (!this.supported) throw new Error('Este navegador não suporta MIDI. Use Chrome ou Edge no computador.');
    this.access = await navigator.requestMIDIAccess();
    this.access.onstatechange = () => this._bind();
    this._bind();
    return this.inputs;
  }

  _bind() {
    this.inputs = [...this.access.inputs.values()];
    for (const inp of this.inputs) inp.onmidimessage = (e) => this._msg(e.data);
    this.h.onDevices && this.h.onDevices(this.inputs.map((i) => i.name));
  }

  _msg([st, d1, d2]) {
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) {
      if (this.learn) { const pad = this.learn; this.learn = null; this.h.onLearn(d1, pad); return; }
      this.h.onNoteOn(d1, d2);
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      this.h.onNoteOff(d1);
    } else if (type === 0xb0) {
      this.h.onCC && this.h.onCC(d1, d2);
    } else if (st === 0xfa) this.h.onStart && this.h.onStart();
    else if (st === 0xfc) this.h.onStop && this.h.onStop();
  }
}
