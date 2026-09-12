import React from "react";

export interface WidgetProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

export const Widget: React.FC<WidgetProps> = ({ id, title, children }) => {
  return (
    <div id={`widget-${id}`} className="bbq-widget">
      <div className="bbq-widget-header">{title}</div>
      <div className="bbq-widget-body">{children}</div>
    </div>
  );
};
