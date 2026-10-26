import { Text as RNText, TextProps } from 'react-native';

import { F } from '@/lib/theme';

/** Text con la tipografía de la app por defecto; los estilos recibidos la sobrescriben. */
export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[F.regular, style]} />;
}
