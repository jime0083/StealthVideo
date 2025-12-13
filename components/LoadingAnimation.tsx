import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Animated, StyleSheet, Easing} from 'react-native';

type LoadingAnimationProps = {
  color?: string;
  dotSize?: number;
  showText?: boolean;
};

const LoadingAnimation = ({
  color = '#D1597B',
  dotSize = 16,
  showText = true,
}: LoadingAnimationProps): React.JSX.Element => {
  const [dots, setDots] = useState('.');

  // 4つのドットのアニメーション値
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;
  const dot4Anim = useRef(new Animated.Value(0)).current;

  // ドットのバウンスアニメーション
  const createBounceAnimation = (animValue: Animated.Value, delay: number) => {
    return Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(animValue, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animValue, {
          toValue: 0,
          duration: 300,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(600 - delay),
      ]),
    );
  };

  useEffect(() => {
    // 各ドットのアニメーションを開始
    const anim1 = createBounceAnimation(dot1Anim, 0);
    const anim2 = createBounceAnimation(dot2Anim, 150);
    const anim3 = createBounceAnimation(dot3Anim, 300);
    const anim4 = createBounceAnimation(dot4Anim, 450);

    anim1.start();
    anim2.start();
    anim3.start();
    anim4.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
      anim4.stop();
    };
  }, [dot1Anim, dot2Anim, dot3Anim, dot4Anim]);

  // Loading... のドット数を変化させる
  useEffect(() => {
    if (!showText) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '.') return '..';
        if (prev === '..') return '...';
        return '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [showText]);

  // Y軸の移動量を計算
  const translateY1 = dot1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -dotSize * 1.5],
  });
  const translateY2 = dot2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -dotSize * 1.5],
  });
  const translateY3 = dot3Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -dotSize * 1.5],
  });
  const translateY4 = dot4Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -dotSize * 1.5],
  });

  const dotStyle = {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: color,
    marginHorizontal: dotSize * 0.4,
  };

  return (
    <View style={styles.container}>
      <View style={styles.dotsContainer}>
        <Animated.View
          style={[dotStyle, {transform: [{translateY: translateY1}]}]}
        />
        <Animated.View
          style={[dotStyle, {transform: [{translateY: translateY2}]}]}
        />
        <Animated.View
          style={[dotStyle, {transform: [{translateY: translateY3}]}]}
        />
        <Animated.View
          style={[dotStyle, {transform: [{translateY: translateY4}]}]}
        />
      </View>
      {showText && (
        <Text style={[styles.loadingText, {color}]}>Loading{dots}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'HiraginoMincho-W3',
    letterSpacing: 1,
  },
});

export default LoadingAnimation;

