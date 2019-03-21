
import {Stream} from "stream";

export class ArrayFormatter extends Stream {

    constructor() {
        super();
        this.writable = false;
        this.done = false;
    }

    write(s) {
        if (!this.writable) {
            this.writable = true;
            this.emit('data', '[' + s);
        } else {
            this.emit('data', ',' + s)
        }
        return true;
    }

    end() {
        if (this.done) return;
        this.done = true;
        this.emit('data', ']');
        this.emit('end')
    }

}