import { AcousticField } from './sound-field.js';

class IslandAcoustics extends AudioWorkletProcessor {
  constructor() {
    super(); this.field = null;
    this.port.onmessage = ({ data }) => {
      if (data.state) {
        this.field ||= new AcousticField(sampleRate, data.seed);
        this.field.setState(data.state);
      }
      if (data.horn && this.field) this.field.horn(data.horn);
      if (data.voice && this.field) this.field.voice(data.voice);
    };
  }
  process(_inputs, outputs) {
    if (this.field) this.field.render(outputs[0]);
    return true;
  }
}
registerProcessor('castaway-acoustics', IslandAcoustics);
