/**
 * Test settlement logic for mutually exclusive bets (Big + Small)
 *
 * Requirement: When betting on both Big and Small simultaneously,
 * only one side wins and the other loses.
 * Net profit should be: bet_amount × margin%
 *
 * Example: $50 Big (2.1x) + $50 Small (2.1x)
 * If Big wins: profit = $5 (5% of $100 total bet)
 */

describe('Settlement Logic - Mutually Exclusive Bets', () => {
  // Mock computeDrawLabels
  const computeDrawLabels = (drawn, threshold) => {
    const sum = (drawn || []).reduce((a, b) => a + b, 0);
    return {
      sum,
      big: sum >= threshold ? "Lớn" : "Nhỏ",
      parity: sum % 2 === 1 ? "Đơn" : "Đôi",
    };
  };

  // Mock evaluateBetWin logic
  const evaluateBetWin = (itemLabel, sum, bigThreshold) => {
    if (itemLabel === "Lớn") return sum >= bigThreshold;
    if (itemLabel === "Nhỏ") return sum < bigThreshold;
    if (itemLabel === "Đơn") return sum % 2 === 1; // Odd
    if (itemLabel === "Đôi") return sum % 2 === 0; // Even
    return false;
  };

  // Mock settlement calculation
  const calculateSettlement = (bets, drawn, config) => {
    const labels = computeDrawLabels(drawn, config.bigThreshold);

    let totalWinnings = 0;
    let profitAdd = 0;
    const results = [];

    bets.forEach((bet) => {
      const won = evaluateBetWin(bet.label, labels.sum, config.bigThreshold);
      const lockedOdds = bet.odds;

      if (won) {
        const payout = +(bet.amount * lockedOdds).toFixed(2);
        totalWinnings += payout;
        profitAdd += (payout - bet.amount);
        results.push({
          label: bet.label,
          amount: bet.amount,
          result: "WIN",
          payout: payout,
        });
      } else {
        profitAdd -= bet.amount;
        results.push({
          label: bet.label,
          amount: bet.amount,
          result: "LOSS",
          payout: 0,
        });
      }
    });

    return {
      totalWinnings,
      profitAdd,
      results,
    };
  };

  // Test Case 1: Big wins with odds 2.1
  test('Case 1: $50 Big (2.1x) + $50 Small (2.1x) => Big Wins', () => {
    const initialBalance = 100;
    const bets = [
      { label: "Lớn", amount: 50, odds: 2.1 },
      { label: "Nhỏ", amount: 50, odds: 2.1 },
    ];
    const drawn = [5, 6, 7]; // sum = 18, >= 13 (bigThreshold) => "Lớn" (Big)
    const config = { bigThreshold: 13 };

    const { totalWinnings, profitAdd } = calculateSettlement(bets, drawn, config);

    const currentBalance = initialBalance - 100; // After placing bets: $100 - $100 = $0
    const newBalance = currentBalance + totalWinnings; // $0 + $105 = $105

    expect(totalWinnings).toBe(105); // $50 × 2.1 = $105
    expect(profitAdd).toBe(5); // Profit: $105 - $50 (Big) - $50 (Small loss) = $5
    expect(newBalance).toBe(105); // Expected: $105 ✓
  });

  // Test Case 2: Small wins with odds 2.1
  test('Case 2: $50 Big (2.1x) + $50 Small (2.1x) => Small Wins', () => {
    const initialBalance = 100;
    const bets = [
      { label: "Lớn", amount: 50, odds: 2.1 },
      { label: "Nhỏ", amount: 50, odds: 2.1 },
    ];
    const drawn = [2, 3, 4]; // sum = 9, < 13 (bigThreshold) => "Nhỏ" (Small)
    const config = { bigThreshold: 13 };

    const { totalWinnings, profitAdd } = calculateSettlement(bets, drawn, config);

    const currentBalance = initialBalance - 100;
    const newBalance = currentBalance + totalWinnings;

    expect(totalWinnings).toBe(105); // $50 × 2.1 = $105
    expect(profitAdd).toBe(5); // Profit: $5
    expect(newBalance).toBe(105); // Expected: $105 ✓
  });

  // Test Case 3: Different bet amounts
  test('Case 3: $40 Big (2.1x) + $60 Small (2.1x) => Big Wins', () => {
    const initialBalance = 200;
    const bets = [
      { label: "Lớn", amount: 40, odds: 2.1 },
      { label: "Nhỏ", amount: 60, odds: 2.1 },
    ];
    const drawn = [8, 8, 8]; // sum = 24, >= 13 => "Lớn" (Big)
    const config = { bigThreshold: 13 };

    const { totalWinnings, profitAdd } = calculateSettlement(bets, drawn, config);

    const currentBalance = initialBalance - 100; // $200 - $100 = $100
    const newBalance = currentBalance + totalWinnings;

    expect(totalWinnings).toBe(84); // $40 × 2.1 = $84
    expect(profitAdd).toBe(-16); // Profit: $84 - $40 - $60 = -$16 (loss overall)
    expect(newBalance).toBe(184); // $100 + $84 = $184
  });

  // Test Case 4: Verify 5% margin profit
  test('Case 4: Verify 5% margin - $100 bet should yield $5 profit', () => {
    const initialBalance = 100;
    const bets = [
      { label: "Lớn", amount: 50, odds: 2.1 },
      { label: "Nhỏ", amount: 50, odds: 2.1 },
    ];
    const drawn = [7, 7, 7]; // sum = 21, >= 13 => "Lớn" (Big)
    const config = { bigThreshold: 13 };

    const { profitAdd } = calculateSettlement(bets, drawn, config);
    const totalBetAmount = 100;
    const expectedProfit = totalBetAmount * 0.05; // 5% margin
    const actualProfit = profitAdd;

    expect(actualProfit).toBe(expectedProfit); // $5 === $5 ✓
  });

  // Test Case 5: Odds 1.95 (default)
  test('Case 5: Default odds 1.95 - $50 Big + $50 Small => Big Wins', () => {
    const initialBalance = 100;
    const bets = [
      { label: "Lớn", amount: 50, odds: 1.95 },
      { label: "Nhỏ", amount: 50, odds: 1.95 },
    ];
    const drawn = [6, 7, 8]; // sum = 21, >= 13 => "Lớn" (Big)
    const config = { bigThreshold: 13 };

    const { totalWinnings, profitAdd } = calculateSettlement(bets, drawn, config);

    const currentBalance = initialBalance - 100;
    const newBalance = currentBalance + totalWinnings;

    expect(totalWinnings).toBe(97.5); // $50 × 1.95 = $97.5
    expect(newBalance).toBe(97.5); // $0 + $97.5 = $97.5
    expect(profitAdd).toBe(-2.5); // Negative profit with 1.95x odds
  });

  // Test Case 6: Odd + Even combination
  test('Case 6: $50 Odd (1.98x) + $50 Even (1.98x) => Odd Wins', () => {
    const initialBalance = 100;
    const drawn2 = [5, 6, 8]; // sum = 19 (odd)
    const config = { bigThreshold: 13 };

    const labels = computeDrawLabels(drawn2, config.bigThreshold);
    const isOdd = labels.parity === "Đơn";
    expect(isOdd).toBe(true);

    const bets = [
      { label: "Đơn", amount: 50, odds: 1.98 },
      { label: "Đôi", amount: 50, odds: 1.98 },
    ];

    const { totalWinnings } = calculateSettlement(bets, drawn2, config);
    const currentBalance = initialBalance - 100; // $100 - $100 = $0
    const newBalance = currentBalance + totalWinnings;

    expect(totalWinnings).toBe(99); // $50 × 1.98 = $99
    expect(newBalance).toBe(99); // $0 + $99 = $99
  });
});
