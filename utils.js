
import {Stream} from "stream";
import {utimes, close, open} from "fs"

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
        if (!this.writable) {
            this.emit('data', '['); // empty result
        }
        this.emit('data', ']');
        this.emit('end');
    }

}

function esc_query(q) {
    return q.replace(new RegExp('-|\\+','g'), m => "\\" + m)
}

export function touchp(path) {
    return new Promise((resolve, reject) => {
        const time = new Date();
        utimes(path, time, time, err => {
            if (err) {
                return open(path, 'w', (err, fd) => {
                    if (err) return reject(err);
                    close(fd, err => (err ? reject(err) : resolve(fd)));
                });
            }
            resolve();
        });
    });
}