const externalDataService = require('../externalDataService');

describe('External Data Service', () => {
  describe('extractTeamsFromMarket', () => {
    it('extracts team names from vs market titles', () => {
      const teams = externalDataService.extractTeamsFromMarket({
        title: 'Arsenal vs Chelsea - Premier League Matchday 30?'
      });

      expect(teams.teamA).toBe('Arsenal');
      expect(teams.teamB).toBe('Chelsea');
    });

    it('returns null teams when no matchup is detected', () => {
      const teams = externalDataService.extractTeamsFromMarket({
        title: 'Will inflation be below 3% in Q4?'
      });

      expect(teams.teamA).toBeNull();
      expect(teams.teamB).toBeNull();
    });
  });

  describe('scoreSportsLayer', () => {
    it('creates sports scores and composite score from recent matches', () => {
      const scored = externalDataService.scoreSportsLayer({
        recentMatches: [
          { isHome: true, isWin: true, isDraw: false, goalsFor: 2, goalsAgainst: 1 },
          { isHome: false, isWin: true, isDraw: false, goalsFor: 1, goalsAgainst: 0 },
          { isHome: true, isWin: false, isDraw: true, goalsFor: 1, goalsAgainst: 1 },
          { isHome: false, isWin: false, isDraw: false, goalsFor: 0, goalsAgainst: 2 },
          { isHome: true, isWin: true, isDraw: false, goalsFor: 3, goalsAgainst: 1 }
        ],
        headToHeadMatches: [{ teamAResult: 'win' }, { teamAResult: 'draw' }, { teamAResult: 'loss' }],
        fixtures: [{}, {}],
        injuredCount: 1
      });

      expect(scored).toHaveProperty('scores');
      expect(scored).toHaveProperty('compositeScore');
      expect(scored.scores).toHaveProperty('teamFormScore');
      expect(scored.scores).toHaveProperty('injuryImpactScore');
      expect(scored.scores).toHaveProperty('headToHeadScore');
      expect(scored.compositeScore).toBeGreaterThanOrEqual(0);
      expect(scored.compositeScore).toBeLessThanOrEqual(100);
    });
  });

  describe('scoreFinancialLayer', () => {
    it('creates financial scores from price and volume series', () => {
      const scored = externalDataService.scoreFinancialLayer({
        prices: [100, 102, 104, 106, 109, 111, 113, 115, 118, 120],
        volumes: [1000, 1010, 990, 1020, 1030, 980, 1100, 1200, 1250, 1300],
        sentimentScore: 60
      });

      expect(scored).toHaveProperty('scores');
      expect(scored).toHaveProperty('compositeScore');
      expect(scored.scores).toHaveProperty('trendScore');
      expect(scored.scores).toHaveProperty('volatilityScore');
      expect(scored.scores).toHaveProperty('volumeStrengthScore');
      expect(scored.scores).toHaveProperty('priceMomentumScore');
      expect(scored.compositeScore).toBeGreaterThanOrEqual(0);
      expect(scored.compositeScore).toBeLessThanOrEqual(100);
    });
  });
});
