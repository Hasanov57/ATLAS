import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

function Button({ kind, className = "", ...props }: Props & { kind: string }) {
  return (
    <button
      type="button"
      {...props}
      className={["ui-button", `ui-button-${kind}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export const PrimaryButton = (props: Props) => (
  <Button kind="primary" {...props} />
);
export const SecondaryButton = (props: Props) => (
  <Button kind="secondary" {...props} />
);
export const DestructiveButton = (props: Props) => (
  <Button kind="destructive" {...props} />
);
export const IconButton = (props: Props) => <Button kind="icon" {...props} />;
export const FloatingMapButton = (props: Props) => (
  <Button kind="floating" {...props} />
);
