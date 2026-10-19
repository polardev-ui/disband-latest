"use client";

import { useEffect } from "react";

/*
 The self-XSS warning Discord and Instagram print in the browser console.
 Scammers talk people into pasting code here to steal their session, so the
 console says so loudly, repeated so it is still on screen after other logs.
*/

const REPEAT = 10;

export function SelfXssWarning() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    for (let i = 0; i < REPEAT; i++) {
      console.log(
        "%cSTOP!",
        "color:#f23f43;font-size:64px;font-weight:900;-webkit-text-stroke:2px #000;font-family:sans-serif",
      );
      console.log(
        "%cThis is a browser feature for developers. If someone told you to copy and paste something here, it is a scam and will give them access to your Disband account.",
        "font-size:18px;font-weight:600;font-family:sans-serif",
      );
      console.log(
        "%cUnless you know exactly what you are doing, close this window and stay safe.",
        "font-size:16px;color:#f23f43;font-family:sans-serif",
      );
    }
  }, []);
  return null;
}
