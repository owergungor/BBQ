import React from "react";

interface IslandOverlayProps {
  visible: boolean;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

export const IslandOverlay: React.FC<IslandOverlayProps> = ({
  visible,
  onDismiss,
  children,
}) => {
  if (!visible) return null;

  return (
    <div
      id="bbq-island-overlay"
      className="bbq-island-overlay"
      onClick={onDismiss}
    >
      {children}
    </div>
  );
};
