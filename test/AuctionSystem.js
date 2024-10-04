const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuctionSystem", function () {
  let AuctionSystem, auctionSystem, owner, seller, bidder1, bidder2, bidder3;
  let startTime, endTime;

  beforeEach(async function () {
    AuctionSystem = await ethers.getContractFactory("AuctionSystem");
    [owner, seller, bidder1, bidder2, bidder3] = await ethers.getSigners();
    auctionSystem = await AuctionSystem.deploy();
    await auctionSystem.waitForDeployment();

    const latestBlock = await ethers.provider.getBlock("latest");
    const latestTimestamp = latestBlock.timestamp;

    startTime = latestTimestamp + 100;
    endTime = startTime + 3600;
  });

  describe("Auction Creation", function () {
    it("Should create a new auction", async function () {
      await expect(auctionSystem.connect(seller).createAuction(startTime, endTime))
        .to.emit(auctionSystem, "AuctionCreated")
        .withArgs(0, seller.address, startTime, endTime);

      const auction = await auctionSystem.auctions(0);
      expect(auction.seller).to.equal(seller.address);
      expect(auction.startTime).to.equal(startTime);
      expect(auction.endTime).to.equal(endTime);
    });

    it("Should revert if end time is before start time", async function () {
      await expect(auctionSystem.connect(seller).createAuction(endTime, startTime))
        .to.be.revertedWith("End time must be after start time");
    });

    it("Should revert if start time is in the past", async function () {
      const pastTime = Math.floor(Date.now() / 1000) - 100;
      await expect(auctionSystem.connect(seller).createAuction(pastTime, endTime))
        .to.be.revertedWith("Start time must be in the future");
    });
  });

  describe("Bidding", function () {
    beforeEach(async function () {
        await auctionSystem.connect(seller).createAuction(startTime, endTime);
        await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
        await ethers.provider.send("evm_mine");
      });

    it("Should place a bid and update highest bidder", async function () {
      await expect(auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") }))
        .to.emit(auctionSystem, "BidPlaced")
        .withArgs(0, bidder1.address, ethers.parseEther("1"));

      const auction = await auctionSystem.auctions(0);
      expect(auction.highestBidder).to.equal(bidder1.address);
      expect(auction.highestBid).to.equal(ethers.parseEther("1"));
    });

    it("Should replace previous highest bid", async function () {
      await auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") });
      await auctionSystem.connect(bidder2).placeBid(0, { value: ethers.parseEther("2") });

      const auction = await auctionSystem.auctions(0);
      expect(auction.highestBidder).to.equal(bidder2.address);
      expect(auction.highestBid).to.equal(ethers.parseEther("2"));

      expect(await auctionSystem.bids(0, bidder1.address)).to.equal(ethers.parseEther("1"));
    });

    it("Should revert if bid is too low", async function () {
      await auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") });
      await expect(auctionSystem.connect(bidder2).placeBid(0, { value: ethers.parseEther("0.5") }))
        .to.be.revertedWithCustomError(auctionSystem, "BidTooLow");
    });

    it("Should revert if auction has not started", async function () {
      const futureStartTime = Math.floor(Date.now() / 1000) + 3600;
      const futureEndTime = futureStartTime + 3600;
      await auctionSystem.connect(seller).createAuction(futureStartTime, futureEndTime);

      await expect(auctionSystem.connect(bidder1).placeBid(1, { value: ethers.parseEther("1") }))
        .to.be.revertedWithCustomError(auctionSystem, "AuctionNotStarted");
    });

    it("Should revert if auction has ended", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine");

      await expect(auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") }))
        .to.be.revertedWithCustomError(auctionSystem, "AuctionEnded");
    });
  });

  describe("Ending Auction", function () {
    beforeEach(async function () {
        await auctionSystem.connect(seller).createAuction(startTime, endTime);
        await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
        await ethers.provider.send("evm_mine");
        await auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") });
      });

    it("Should end auction and transfer funds to seller", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine");

      const initialSellerBalance = await ethers.provider.getBalance(seller.address);

      await expect(auctionSystem.connect(owner).endAuction(0))
        .to.emit(auctionSystem, "AuctionEndedEvent")
        .withArgs(0, bidder1.address, ethers.parseEther("1"));

      const finalSellerBalance = await ethers.provider.getBalance(seller.address);
      expect(finalSellerBalance - initialSellerBalance).to.equal(ethers.parseEther("1"));

      const auction = await auctionSystem.auctions(0);
      expect(auction.ended).to.be.true;
    });

    it("Should revert if auction has not ended", async function () {
      await expect(auctionSystem.connect(owner).endAuction(0))
        .to.be.revertedWithCustomError(auctionSystem, "AuctionNotEnded");
    });

    it("Should revert if auction is already ended", async function () {
      await ethers.provider.send("evm_setNextBlockTimestamp", [endTime + 1]);
      await ethers.provider.send("evm_mine");
      await auctionSystem.connect(owner).endAuction(0);

      await expect(auctionSystem.connect(owner).endAuction(0))
        .to.be.revertedWithCustomError(auctionSystem, "AuctionAlreadyEnded");
    });
  });

  describe("Withdrawing Bids", function () {
    beforeEach(async function () {
        await auctionSystem.connect(seller).createAuction(startTime, endTime);
        await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
        await ethers.provider.send("evm_mine");
        await auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") });
        await auctionSystem.connect(bidder2).placeBid(0, { value: ethers.parseEther("2") });
      });

    it("Should allow non-winning bidder to withdraw", async function () {
      const initialBalance = await ethers.provider.getBalance(bidder1.address);

      await expect(auctionSystem.connect(bidder1).withdrawBid(0))
        .to.emit(auctionSystem, "WithdrawalMade")
        .withArgs(0, bidder1.address, ethers.parseEther("1"));

      const finalBalance = await ethers.provider.getBalance(bidder1.address);
      expect(finalBalance).to.be.gt(initialBalance);

      expect(await auctionSystem.bids(0, bidder1.address)).to.equal(0);
    });

    it("Should revert if highest bidder tries to withdraw", async function () {
      await expect(auctionSystem.connect(bidder2).withdrawBid(0))
        .to.be.revertedWithCustomError(auctionSystem, "NotHighestBidder");
    });

    it("Should revert if bidder has no funds to withdraw", async function () {
      await expect(auctionSystem.connect(bidder3).withdrawBid(0))
        .to.be.revertedWithCustomError(auctionSystem, "WithdrawalFailed");
    });
  });

  describe("Get Auction Details", function () {
    it("Should return correct auction details", async function () {
      await auctionSystem.connect(seller).createAuction(startTime, endTime);
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 1]);
      await ethers.provider.send("evm_mine");
      await auctionSystem.connect(bidder1).placeBid(0, { value: ethers.parseEther("1") });
  
      const details = await auctionSystem.getAuctionDetails(0);
      expect(details.seller).to.equal(seller.address);
      expect(details.startTime).to.equal(startTime);
      expect(details.endTime).to.equal(endTime);
      expect(details.highestBid).to.equal(ethers.parseEther("1"));
      expect(details.highestBidder).to.equal(bidder1.address);
      expect(details.ended).to.be.false;
    });
  });
});