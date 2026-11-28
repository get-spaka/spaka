// A made-up recording of the agent asking for a secret (Q559), played back
// like the recordings of the real agent: the first turn builds the bakery of
// bakery.jsonl; the second asks for PAYMENT_KEY with ask_secret, which runs
// for real in the replay and waits for the maker's card; the third asks for
// it again, declined this time.
import { writeFileSync } from "node:fs";
import { bakeryBuilt, type Line, result, spakaCall, words } from "./packages-recording.ts";

export const ASKED = {
  name: "PAYMENT_KEY",
  purpose: "Stripe's secret key, to take payments for lessons",
  where_to_find: "In Stripe's dashboard: Developers › API keys › Secret key",
};

export function writeSecretsRecording(file: string) {
  const turns: Line[][] = [
    [...bakeryBuilt(), ...words(1200, "The bakery is ready."), result(1300, "Done.")],
    [...spakaCall(100, "s1", "ask_secret", ASKED), ...words(200, "Thanks."), result(300, "Done.")],
    [
      ...spakaCall(100, "s2", "ask_secret", { ...ASKED, name: "MAILER_KEY", purpose: "The mail service's key" }),
      ...words(200, "Fine."),
      result(300, "Done."),
    ],
  ];
  writeFileSync(
    file,
    `${turns
      .flat()
      .map((l) => JSON.stringify(l))
      .join("\n")}\n`,
  );
}
