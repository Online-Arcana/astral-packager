// @ts-check

import { child, edSign, signSeed } from "./crypto.ts";
import { wipe } from "./bytes.ts";

export class Id {
  #root;
  #doc;
  #pub;
  #live = true;

  constructor(root, doc, pub) {
    this.#root = root;
    this.#doc = doc;
    this.#pub = pub;
  }

  get pub() {
    return this.#pub;
  }

  async sign(data) {
    this.#need();
    const seed = await signSeed(this.#root, this.#doc);
    try {
      return await edSign(seed, data);
    } finally {
      wipe(seed);
    }
  }

  async key(name, ctx = new Uint8Array()) {
    this.#need();
    if (!/^[a-z0-9][a-z0-9._/-]{0,95}$/u.test(name)) throw new Error("Invalid key scope");
    return child(this.#root, this.#doc, name, ctx);
  }

  drop() {
    if (!this.#live) return;
    wipe(this.#root);
    wipe(this.#doc);
    this.#live = false;
  }

  #need() {
    if (!this.#live) throw new Error("Identity has been dropped");
  }
}
