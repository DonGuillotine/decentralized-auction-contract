// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

contract AuctionSystem is ReentrancyGuard, Ownable {
    using Math for uint256;

    struct Auction {
        address payable seller;
        uint256 startTime;
        uint256 endTime;
        uint256 highestBid;
        address payable highestBidder;
        bool ended;
    }

    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => uint256)) public bids;
    uint256 public auctionCounter;

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 startTime, uint256 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionEndedEvent(uint256 indexed auctionId, address winner, uint256 amount);
    event WithdrawalMade(uint256 indexed auctionId, address indexed bidder, uint256 amount);

    error AuctionNotStarted();
    error AuctionEnded();
    error BidTooLow();
    error AuctionNotEnded();
    error NotHighestBidder();
    error WithdrawalFailed();
    error AuctionAlreadyEnded();

    constructor() Ownable(msg.sender) {}

    function createAuction(uint256 _startTime, uint256 _endTime) external {
        require(_startTime > block.timestamp, "Start time must be in the future");
        require(_endTime > _startTime, "End time must be after start time");

        uint256 auctionId = auctionCounter++;
        auctions[auctionId] = Auction({
            seller: payable(msg.sender),
            startTime: _startTime,
            endTime: _endTime,
            highestBid: 0,
            highestBidder: payable(address(0)),
            ended: false
        });

        emit AuctionCreated(auctionId, msg.sender, _startTime, _endTime);
    }

    function placeBid(uint256 _auctionId) external payable nonReentrant {
        Auction storage auction = auctions[_auctionId];
        
        if (block.timestamp < auction.startTime) revert AuctionNotStarted();
        if (block.timestamp > auction.endTime) revert AuctionEnded();
        if (msg.value <= auction.highestBid) revert BidTooLow();

        if (auction.highestBidder != address(0)) {
            bids[_auctionId][auction.highestBidder] += auction.highestBid;
        }

        auction.highestBidder = payable(msg.sender);
        auction.highestBid = msg.value;

        emit BidPlaced(_auctionId, msg.sender, msg.value);
    }

    function endAuction(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];
        
        if (block.timestamp <= auction.endTime) revert AuctionNotEnded();
        if (auction.ended) revert AuctionAlreadyEnded();

        auction.ended = true;
        if (auction.highestBidder != address(0)) {
            auction.seller.transfer(auction.highestBid);
        }

        emit AuctionEndedEvent(_auctionId, auction.highestBidder, auction.highestBid);
    }

    function withdrawBid(uint256 _auctionId) external nonReentrant {
        Auction storage auction = auctions[_auctionId];
        uint256 amount = bids[_auctionId][msg.sender];

        if (auction.highestBidder == msg.sender) revert NotHighestBidder();
        if (amount == 0) revert WithdrawalFailed();

        bids[_auctionId][msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert WithdrawalFailed();

        emit WithdrawalMade(_auctionId, msg.sender, amount);
    }

    function getAuctionDetails(uint256 _auctionId) external view returns (
        address seller,
        uint256 startTime,
        uint256 endTime,
        uint256 highestBid,
        address highestBidder,
        bool ended
    ) {
        Auction storage auction = auctions[_auctionId];
        return (
            auction.seller,
            auction.startTime,
            auction.endTime,
            auction.highestBid,
            auction.highestBidder,
            auction.ended
        );
    }
}