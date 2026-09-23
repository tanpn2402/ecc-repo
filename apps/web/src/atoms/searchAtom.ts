import { atom } from "jotai";

export const globalFilterAtom = atom({
  value: "",
  triggered: false,
});
