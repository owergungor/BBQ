import React from "react";

export interface WidgetHeaderProps {
  title: string;
  icon?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  onCollapse?: () => void;
  className?: string;
}

export const WidgetHeader: React.FC<WidgetHeaderProps> = ({
  title,
  icon,
  badge,
  actions,
  onCollapse,
  className = "",
}) => {
  return (
    <div className={`bbq-widget-header-row ${className}`}>
      <div className="bbq-widget-header-title-group">
        {icon && <span className="bbq-widget-header-icon" aria-hidden="true">{icon}</span>}
        <h2 className="bbq-widget-header-title">{title}</h2>
        {badge && <span className="bbq-widget-header-badge">{badge}</span>}
      </div>
      <div className="bbq-widget-header-actions">
        {actions}
        {onCollapse && (
          <button
            type="button"
            className="bbq-btn bbq-btn-icon"
            onClick={onCollapse}
            aria-label={`Collapse ${title}`}
            title="Collapse (Esc)"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export interface WidgetEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const WidgetEmptyState: React.FC<WidgetEmptyStateProps> = ({
  icon = "ℹ️",
  title,
  description,
  action,
}) => {
  return (
    <div className="bbq-widget-empty-state" role="status">
      <div className="bbq-widget-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="bbq-widget-empty-title">{title}</div>
      {description && <div className="bbq-widget-empty-desc">{description}</div>}
      {action && (
        <button
          type="button"
          className="bbq-btn bbq-btn-primary"
          onClick={action.onClick}
          style={{ marginTop: "var(--bbq-space-8)" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export interface WidgetErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const WidgetErrorState: React.FC<WidgetErrorStateProps> = ({
  title = "Something went wrong",
  message,
  onRetry,
}) => {
  return (
    <div className="bbq-widget-error-fallback" role="alert">
      <div className="bbq-widget-error-title">⚠️ {title}</div>
      <div className="bbq-widget-error-desc">{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="bbq-btn bbq-btn-danger"
          style={{ marginTop: "var(--bbq-space-8)" }}
        >
          Retry
        </button>
      )}
    </div>
  );
};

export interface WidgetBadgeProps {
  variant?: "accent" | "danger" | "warning" | "success" | "info" | "neutral";
  children: React.ReactNode;
  title?: string;
}

export const WidgetBadge: React.FC<WidgetBadgeProps> = ({
  variant = "neutral",
  children,
  title,
}) => {
  return (
    <span className={`bbq-badge bbq-badge-${variant}`} title={title}>
      {children}
    </span>
  );
};

export interface WidgetCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({
  children,
  className = "",
  onClick,
}) => {
  return (
    <div className={`bbq-widget-card ${className}`} onClick={onClick}>
      {children}
    </div>
  );
};
