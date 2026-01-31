export enum TemplateCategory {
  SERVICE = 'service',
  LOGIN = 'login',
  NOTIFICATION = 'notification',
  FOLLOW_UP = 'follow_up',
  REMINDER = 'reminder',
}

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  [TemplateCategory.SERVICE]: 'Service Template',
  [TemplateCategory.LOGIN]: 'Login Template',
  [TemplateCategory.NOTIFICATION]: 'Notification Template',
  [TemplateCategory.FOLLOW_UP]: 'Follow-up Template',
  [TemplateCategory.REMINDER]: 'Reminder Template',
};
