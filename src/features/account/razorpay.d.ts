/** react-native-razorpay ships no types: the one call the checkout uses. */
declare module "react-native-razorpay" {
  const RazorpayCheckout: {
    /** Resolves with the success payload; rejects with `{ code, description }` on cancel or failure. */
    open(options: Record<string, unknown>): Promise<Record<string, string>>;
  };
  export default RazorpayCheckout;
}
