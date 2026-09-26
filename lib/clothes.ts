/** Preset clothing images. Drop replacements into /public/clothes/ with the same filenames. */
export const CLOTHES = [
  {
    label: "Black T-shirt",
    file: "black-tshirt.png",
    prompt:
      "Substitute the current top with a plain black cotton t-shirt with a regular fit and crew neckline",
  },
  {
    label: "White T-shirt",
    file: "white-tshirt.png",
    prompt:
      "Substitute the current top with a plain white cotton t-shirt with a regular fit and crew neckline",
  },
  {
    label: "Blue T-shirt",
    file: "blue-tshirt.png",
    prompt:
      "Substitute the current top with a plain blue cotton t-shirt with a regular fit and crew neckline",
  },
  {
    label: "Hoodie",
    file: "hoodie.png",
    prompt:
      "Substitute the current top with a grey pullover hoodie with a kangaroo pocket and drawstrings, casual relaxed fit",
  },
  {
    label: "Jacket",
    file: "jacket.png",
    prompt:
      "Substitute the current top with a black leather bomber jacket with ribbed cuffs and hem, slightly relaxed fit",
  },
  {
    label: "Shirt",
    file: "shirt.png",
    prompt:
      "Substitute the current top with a light blue button-up oxford shirt with a collar and long sleeves, casual fit",
  },
] as const;

export type Clothing = (typeof CLOTHES)[number];
