declare module '@emoji-mart/react' {
  import { ComponentType } from 'react';
  const Picker: ComponentType<Record<string, any>>;
  export default Picker;
}

declare module '@emoji-mart/data' {
  const data: Record<string, any>;
  export default data;
}
